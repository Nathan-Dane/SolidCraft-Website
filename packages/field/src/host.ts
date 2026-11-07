/*
 * The field in the page. The host picks a tier, builds the field from the hero, and runs it on the frame scheduler:
 *
 *   live    the field is simulated and drawn on the GPU at the page's pace (30 updates a second while the visitor is active,
 *           20 when not, every frame while scrolling)
 *   still   the same picture, simulated to a fixed time and drawn once; only scrolling redraws it (reduced motion)
 *   poster  no field: WebGL is missing or too slow, and the page shows the static drawing
 *
 * Scrolling moves the anchored nodes with the page and the others at half its speed. Once the hero has left, the field is parked:
 * its canvas is hidden and nothing runs until the page scrolls back.
 */
import type { Scheduler, Task } from "@solidcraft/frame";
import { createField, type Field } from "./field.ts";
import { createGLRenderer, type GLRenderer } from "./gl-renderer.ts";
import { createGovernor } from "./governor.ts";
import { createHero, type Hero } from "./hero.ts";
import { fieldOpacity, satelliteOpacity } from "./parallax.ts";
import { fitView, type ViewBox } from "./view.ts";

export type Tier = "live" | "still" | "poster";

export type HostOptions = {
	/** The fixed layer behind the page: it gets `live` and `parked` classes. */
	backdrop: HTMLElement;
	canvas: HTMLCanvasElement;
	scheduler: Scheduler;
	seed?: number;
	/** Draw one still frame instead of animating. */
	reduced?: boolean;
	/** Accept a software renderer (for tests). */
	allowSoftware?: boolean;
	/** Called after the field was rebuilt for a new layout (a resize). */
	onRebuild?: (host: Host) => void;
};

export type Host = {
	readonly tier: Tier;
	readonly field: Field | null;
	readonly hero: Hero;
	readonly view: ViewBox;
	/** Give up the live field for the poster. */
	fallback(why: string): void;
	stop(): void;
};

const STILL_SECONDS = 6;
const root = document.documentElement;

export async function startHost(opts: HostOptions): Promise<Host> {
	const { backdrop, canvas, scheduler } = opts;
	await (document.fonts?.ready ?? Promise.resolve());

	const field = createField({ seed: opts.seed || 20, maxLabels: innerWidth < 720 ? 4 : 8 });
	const hero = createHero();
	const sats = [...document.querySelectorAll<HTMLElement>("[data-satellite]")];
	const animate = !opts.reduced;
	const renderer: GLRenderer | null = createGLRenderer(canvas, field.roots, {
		maxDpr: 2,
		allowSoftware: opts.allowSoftware ?? false,
	});

	let tier: Tier = renderer ? (animate ? "live" : "still") : "poster";
	let vb = fitView(backdrop.clientWidth || innerWidth, backdrop.clientHeight || innerHeight);
	let tasks: Task[] = [];
	let parked = false; // decided in the read phase, so the simulation of the same frame already knows
	let paintedParked = false;
	let lastY = Number.NaN;
	let lastOpacity = -1;
	let lastSats = -1;
	let resizeTimer = 0;
	let stopped = false;

	const host: Host = {
		get tier() {
			return tier;
		},
		get field() {
			return tier === "poster" ? null : field;
		},
		hero,
		get view() {
			return vb;
		},
		fallback,
		stop,
	};

	function setTier(t: Tier): void {
		tier = t;
		root.dataset.field = t;
		root.classList.toggle("poster-on", t === "poster");
	}

	function fallback(why: string): void {
		if (tier === "poster") return;
		console.warn(`The field is off: ${why}`);
		stop();
		backdrop.classList.remove("live", "parked");
		hero.release();
		setTier("poster");
	}

	function stop(): void {
		stopped = true;
		for (const t of tasks) t.remove();
		tasks = [];
		clearTimeout(resizeTimer);
	}

	if (!renderer) {
		setTier("poster");
		return host;
	}
	const gl = renderer;
	gl.onlost = () => fallback("the graphics context was lost");

	function build(): void {
		vb = fitView(backdrop.clientWidth || innerWidth, backdrop.clientHeight || innerHeight);
		hero.release();
		field.build(hero.layout(vb));
		hero.attach(field);
		field.setView(vb.x, vb.y, vb.w, vb.h);
		field.setScroll(window.scrollY / vb.s);
		if (!animate) field.advance(STILL_SECONDS);
	}

	/** The scroll effects on the page's parts: the field's fade, parking, and the satellites' fade. */
	function paintScroll(y: number): void {
		const op = fieldOpacity(y, innerHeight);
		if (op !== lastOpacity) {
			lastOpacity = op;
			canvas.style.opacity = String(op);
		}
		const so = satelliteOpacity(y, innerHeight);
		if (so !== lastSats) {
			lastSats = so;
			for (const s of sats) s.style.opacity = String(so);
			root.classList.toggle("sats-off", so < 0.02);
		}
		if (parked !== paintedParked) {
			paintedParked = parked;
			backdrop.classList.toggle("parked", parked);
			root.classList.toggle("hero-away", parked);
		}
	}

	const governor = createGovernor();
	let dirtyScroll = true;
	let moved = false;

	const reader = scheduler.add({
		phase: "read",
		run() {
			const y = window.scrollY;
			if (y === lastY && !dirtyScroll) return parked ? "sleep" : undefined;
			dirtyScroll = false;
			// parked and still moving away: nothing is visible, and the field catches up the moment the page scrolls back
			const away = y > lastY;
			lastY = y;
			if (parked && away) return "sleep";
			moved = field.setScroll(y / vb.s) || moved;
			parked = fieldOpacity(y, innerHeight) === 0 || field.allAbove();
			return undefined;
		},
	});
	tasks.push(reader);

	if (animate) {
		tasks.push(
			scheduler.add({
				phase: "simulate",
				rate: "policy",
				run(frame) {
					if (parked) return "sleep";
					field.step(frame.dt);
					return undefined;
				},
			}),
		);
	}

	const writer = scheduler.add({
		phase: "write",
		run(frame) {
			paintScroll(lastY);
			if (!parked) {
				hero.follow(field, vb);
				gl.draw(vb);
			}
			if (animate && frame.dt > 0 && !parked) {
				const decision = governor.push(frame.dt * 1000);
				if (decision === "poster") {
					fallback("frames are too slow");
					return "sleep";
				}
				if (decision !== "keep") gl.setMaxDpr(decision.dpr);
			}
			if (!animate && !moved) return "sleep";
			moved = false;
			return parked ? "sleep" : undefined;
		},
	});
	tasks.push(writer);

	const wake = (): void => {
		dirtyScroll = true;
		for (const t of tasks) t.wake();
	};
	addEventListener("scroll", wake, { passive: true });

	addEventListener("resize", () => {
		if (stopped) return;
		vb = fitView(backdrop.clientWidth || innerWidth, backdrop.clientHeight || innerHeight);
		field.setView(vb.x, vb.y, vb.w, vb.h);
		gl.resize();
		wake();
		clearTimeout(resizeTimer); // the hero's nodes follow the page layout: rebuild the field once resizing settles
		resizeTimer = window.setTimeout(() => {
			if (stopped) return;
			build();
			gl.draw(vb, true);
			lastY = Number.NaN;
			wake();
			opts.onRebuild?.(host);
		}, 180);
	});

	// the visitor over the hero's empty space is over the field: hovering a node shows its dimension, clicking sends a pulse
	const overField = (e: Event): boolean => {
		const t = e.target as Element | null;
		return (
			!!t &&
			(t === root ||
				t === document.body ||
				t === canvas ||
				t.matches?.("main, .hero, .backdrop") === true)
		);
	};
	const world = (e: PointerEvent | MouseEvent): { x: number; y: number } => ({
		x: vb.x + e.clientX / vb.s,
		y: vb.y + e.clientY / vb.s,
	});
	addEventListener(
		"pointermove",
		(e) => {
			if (stopped || parked) return;
			const p = world(e);
			field.pointer(p.x, p.y, overField(e));
		},
		{ passive: true },
	);
	addEventListener("click", (e) => {
		if (stopped || parked || !overField(e)) return;
		const p = world(e);
		const id = field.hit(p.x, p.y);
		if (id >= 0) field.pulse(id);
	});

	setTier(tier); // the satellites are shown (and so measured) only once the field is on
	build();
	hero.bind(field, () => scheduler.poke());
	backdrop.classList.add("live"); // the canvas has a size only once it is shown
	gl.resize();
	gl.draw(vb, true);
	wake();
	return host;
}
