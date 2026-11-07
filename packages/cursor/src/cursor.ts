/*
 * The cursor. A small exact dot is the pointer and a ring trails it. Near a shape (an element marked `data-focus`, or a node of the
 * field) the ring is drawn toward it while the shape leans toward the dot; inside a shape the ring grows into a disc that exactly
 * fills it, and the shape is held toward the dot. While docked, a faint glow shows where the real pointer is. Over selectable text
 * the dot stretches into a beam as tall as the line.
 *
 * It runs on the frame scheduler and sleeps when the pointer is still, the ring has settled and nothing is docked or leaning.
 */
import type { Scheduler, Task } from "@solidcraft/frame";
import {
	DWELL,
	edgeDistance,
	FAST,
	LEAN_MAX,
	LEAVE,
	MAX_PULL,
	MEET,
	MIN_R,
	PAD,
	RING,
	type Shape,
	Spring,
	type Stretch,
	smooth,
	stepStretch,
	ZONE,
} from "./geometry.ts";
import { createRegistry, type FocusItem, type Registry } from "./registry.ts";

/** What the cursor needs of a node of the field. */
export type FieldNodeLike = {
	id: number;
	x: number;
	y: number;
	qx: number;
	qy: number;
	R: number;
	fixed: boolean;
	kind: string;
};

/** A hero part that is also a node: the logo, a button (page coordinates, y including the scroll). */
export type PageShape = { id: number; ids: number[]; x: number; y: number; w: number; h: number };

/** The field as the cursor sees it: where its nodes are, and how to pull and light them. */
export type FieldPort = {
	nodes(): readonly FieldNodeLike[];
	/** x, y: the world position of the window's top left; s: pixels per world unit */
	view(): { x: number; y: number; s: number };
	shapes(): readonly PageShape[];
	/** pull a node by (dx, dy) world units (0, 0 lets it go) */
	attract(id: number, dx: number, dy: number): void;
	setHot(id: number, on: boolean): void;
};

export type CursorOptions = {
	scheduler: Scheduler;
	/** Nodes cannot be reached through what matches this (the page's sections scroll over the field). */
	nodeBlockers?: string;
};

export type Cursor = {
	/** Connect or disconnect the field (docking on its nodes). */
	setField(port: FieldPort | null): void;
	/** Docking on the field's nodes can be switched off (the field is parked); the ring keeps following the pointer. */
	setEnabled(on: boolean): void;
	/** The page scrolled or changed under a still pointer. */
	retarget(): void;
	/** The id of the node the ring is docked on, or -1. */
	docked(): number;
	destroy(): void;
};

type Candidate =
	| { kind: "el"; item: FocusItem }
	| { kind: "shape"; shape: PageShape }
	| { kind: "node"; id: number };

type Geo = Shape & {
	kind: "el" | "shape" | "node";
	el: HTMLElement | null;
	ids: number[];
	id: number;
	vis: boolean;
};

type Lean = { x: number; y: number; vx: number; vy: number; tx: number; ty: number };

const PIN_KEY = "sc-pointer";

export function createCursor(opts: CursorOptions): Cursor {
	const { scheduler } = opts;
	const blockers = opts.nodeBlockers ?? ".sec, .foot";
	const root = document.documentElement;
	const host = document.createElement("div");
	host.id = "cursor";
	host.setAttribute("aria-hidden", "true");
	host.innerHTML =
		'<div class="cur-ring"><div class="cur-glow"></div></div><div class="cur-dot"></div>';
	document.body.appendChild(host);
	const ring = host.firstElementChild as HTMLElement;
	const glow = ring.firstElementChild as HTMLElement; // the glow lives inside the ring, which clips it to its own outline
	const dot = host.querySelector<HTMLElement>(".cur-dot") as HTMLElement;
	root.classList.add("has-cursor");
	const BORDER = 1.25; // the ring's border (css): the glow is positioned from the ring's inner corner

	const registry: Registry = createRegistry();
	let field: FieldPort | null = null;

	const P = { x: -99, y: -99 };
	let speed = 0;
	let lastMove = 0;
	let enabled = true;
	let active = false; // the cursor is shown (everywhere except over form fields)
	let dwell = 0;
	let target: Candidate | null = null;
	let lastG: Geo | null = null;
	let pulled: (HTMLElement | number)[] = [];
	const X = new Spring(-99);
	const Y = new Spring(-99);
	const W = new Spring(RING);
	const H = new Spring(RING);
	const L = new Spring(0); // how far the ring has docked onto its shape: 0 = free ring, 1 = exactly the shape
	const elState = new Map<HTMLElement, Lean>();
	let under: Element | null = null;
	let underSec = false;
	const str: Stretch = { a: 0, s: 0 };
	let prevT = 0;
	let sleeping = false;
	let dirty = true;
	let needUnder = false;
	let needText = true;
	let lastCheck = 0;
	let lastUnder = 0;
	let sy = 0;
	let beamH = 0;
	let best: Geo | null = null;
	let bestC: Candidate | null = null;
	let bestD = Number.POSITIVE_INFINITY;
	// the styles last written: only changes are written
	const last = { rw: -1, rh: -1, rr: -1, rt: "", gt: "", on: null as boolean | null };

	function setUnder(t: Element | null): void {
		if (t === under) return;
		under = t;
		active = !t?.closest("input, select, textarea"); // everywhere, except over form fields (native text cursor)
		underSec = !!t?.closest(blockers);
	}

	const selOK = new WeakMap<Element, boolean>();
	function selectable(el: Element): boolean {
		const hit = selOK.get(el);
		if (hit !== undefined) return hit;
		let v = !el.closest("a, button, input, select, textarea, label, summary, [data-focus]");
		for (let e: Element | null = el; v && e && e.nodeType === 1; e = e.parentElement) {
			const cs = getComputedStyle(e);
			if (cs.userSelect === "none" || cs.webkitUserSelect === "none") v = false;
		}
		selOK.set(el, v);
		return v;
	}

	function hasText(el: Element): boolean {
		for (let n = el.firstChild; n; n = n.nextSibling)
			if (n.nodeType === 3 && /\S/.test(n.nodeValue ?? "")) return true;
		return false;
	}

	// over selectable text the dot stretches into a beam as tall as the line of text under it. The line is found from the text node
	// nearest the pointer (its own client rectangles), so empty space beside a short line does not count.
	function textBeam(x: number, y: number, t: Element | null): void {
		let h = 0;
		if (t && hasText(t) && selectable(t)) {
			let node: Node | null = null;
			const doc = document as Document & {
				caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
				caretRangeFromPoint?: (x: number, y: number) => Range | null;
			};
			if (doc.caretPositionFromPoint) node = doc.caretPositionFromPoint(x, y)?.offsetNode ?? null;
			else if (doc.caretRangeFromPoint)
				node = doc.caretRangeFromPoint(x, y)?.startContainer ?? null;
			if (node && node.nodeType === 3 && t.contains(node)) {
				const rg = document.createRange();
				rg.selectNodeContents(node);
				for (const r of rg.getClientRects()) {
					if (x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 2 && y <= r.bottom + 2) {
						h = r.height;
						break;
					}
				}
			}
		}
		const bh = h > 0 ? Math.max(14, Math.min(h, 46)) : 0;
		if (bh === beamH) return;
		beamH = bh;
		dot.classList.toggle("beam", bh > 0);
		host.classList.toggle("text", bh > 0); // the ring steps aside while the beam is shown
		if (bh > 0) dot.style.setProperty("--bh", `${bh.toFixed(1)}px`);
	}

	function kick(): void {
		dirty = true;
		sleeping = false;
		task.wake();
	}

	// an element leans toward the pointer with the same under-damped spring the nodes use; it uses the `translate` property so it
	// composes with the element's own transforms
	function setLean(el: HTMLElement, x: number, y: number): void {
		let st = elState.get(el);
		if (!st) {
			if (!x && !y) return;
			st = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
			elState.set(el, st);
		}
		st.tx = x;
		st.ty = y;
	}

	function stepLean(dt: number): void {
		if (!elState.size) return;
		for (const [el, st] of elState) {
			const n = Math.ceil(dt / 0.004);
			const h = dt / n;
			for (let i = 0; i < n; i++) {
				st.vx += (140 * (st.tx - st.x) - 14 * st.vx) * h;
				st.x += st.vx * h;
				st.vy += (140 * (st.ty - st.y) - 14 * st.vy) * h;
				st.y += st.vy * h;
			}
			if (
				!st.tx &&
				!st.ty &&
				Math.abs(st.x) + Math.abs(st.y) < 0.02 &&
				Math.abs(st.vx) + Math.abs(st.vy) < 0.5
			) {
				el.style.translate = "";
				elState.delete(el);
			} else el.style.translate = `${st.x.toFixed(2)}px ${st.y.toFixed(2)}px`;
		}
	}

	function geometry(c: Candidate): Geo {
		if (c.kind === "el") {
			// from the cached layout rectangle: no layout is read here
			const it = c.item;
			const st = elState.get(it.el);
			const lx = st ? st.x : 0;
			const ly = st ? st.y : 0;
			const hy = it.cy - (it.fixed ? 0 : sy);
			return {
				kind: "el",
				el: it.el,
				ids: [],
				id: -1,
				cx: it.cx + lx,
				cy: hy + ly,
				hx: it.cx,
				hy,
				w: it.w,
				h: it.h,
				r: Math.min(it.r, Math.min(it.w, it.h) / 2),
				vis: it.w > 0 && hy + it.h / 2 > 0 && hy - it.h / 2 < innerHeight,
			};
		}
		const f = field as FieldPort;
		const v = f.view();
		if (c.kind === "node") {
			const n = f.nodes()[c.id] as FieldNodeLike;
			const R = n.R * v.s;
			return {
				kind: "node",
				el: null,
				id: c.id,
				ids: [c.id],
				cx: (n.x - v.x) * v.s,
				cy: (n.y - v.y) * v.s,
				hx: (n.x - n.qx - v.x) * v.s,
				hy: (n.y - n.qy - v.y) * v.s,
				w: 2 * R,
				h: 2 * R,
				r: R,
				vis: true,
			};
		}
		const sh = c.shape;
		const n = f.nodes()[sh.id] as FieldNodeLike;
		return {
			kind: "shape",
			el: null,
			id: sh.id,
			ids: sh.ids,
			cx: sh.x + n.qx * v.s,
			cy: sh.y - sy + n.qy * v.s,
			hx: sh.x,
			hy: sh.y - sy,
			w: sh.w,
			h: sh.h,
			r: Math.min(sh.w, sh.h) / 2,
			vis: true,
		};
	}

	// the field's nodes can only be reached over the hero and its background, not through the sections that scroll over them
	const nodesOK = () => !!field && enabled && !underSec;

	function letGo(it: HTMLElement | number): void {
		if (typeof it === "number") field?.attract(it, 0, 0);
		else setLean(it, 0, 0);
	}

	const NONE: (HTMLElement | number)[] = [];
	// lean this shape (its nodes, or its element) by (dx, dy) screen px and let go of anything else
	function pull(g: Geo | null, dx: number, dy: number): void {
		const next: (HTMLElement | number)[] = g ? (g.el ? [g.el] : g.ids) : NONE;
		if (next === NONE && !pulled.length) return;
		for (const it of pulled) if (!next.includes(it)) letGo(it);
		const s = field ? field.view().s : 1;
		for (const it of next) {
			if (typeof it === "number") field?.attract(it, dx / s, dy / s);
			else setLean(it, dx, dy);
		}
		pulled = next === NONE ? [] : next;
	}

	function release(): void {
		if (target?.kind === "node") field?.setHot(target.id, false);
		pull(null, 0, 0);
		target = null;
		host.classList.remove("docked");
	}

	function dock(c: Candidate): void {
		release();
		target = c;
		host.classList.add("docked");
		if (c.kind === "node") field?.setHot(c.id, true);
	}

	function consider(c: Candidate, g: Geo): void {
		if (!g.vis) return;
		const d = edgeDistance(g, P.x, P.y);
		// an element covered by something else (the bar over a scrolled card) cannot be reached through it
		if (c.kind === "el" && d < 0 && under && !c.item.el.contains(under)) return;
		if (d < bestD) {
			bestD = d;
			best = g;
			bestC = c;
		}
	}

	function run(frame: { time: number }): "sleep" | undefined {
		const ts = frame.time;
		if (sleeping && !dirty && ts - lastCheck < 250) return "sleep";
		lastCheck = ts;
		dirty = false;
		const dt = prevT ? Math.min(0.033, (ts - prevT) / 1000) : 0.016;
		prevT = ts;
		sy = window.scrollY;
		// what is under a still pointer is re-read at most about 12 times a second while the page scrolls (a hit test per frame is costly)
		if (needUnder) {
			if (ts - lastUnder >= 80) {
				needUnder = false;
				lastUnder = ts;
				setUnder(document.elementFromPoint(P.x, P.y));
				needText = true;
			} else dirty = true;
		}
		if (needText) {
			needText = false;
			textBeam(P.x, P.y, active ? under : null);
		}
		speed *= Math.exp(-dt * 9); // decays when the pointer stops
		stepLean(dt);
		best = null;
		bestC = null;
		bestD = Number.POSITIVE_INFINITY;
		if (active) {
			// only shapes the pointer is near are measured at all (their cached rectangles are compared first, without allocating)
			for (const item of registry.visible()) {
				const st = elState.get(item.el);
				const ecy = item.cy - (item.fixed ? 0 : sy) + (st ? st.y : 0);
				const ecx = item.cx + (st ? st.x : 0);
				if (Math.abs(P.x - ecx) > item.w / 2 + PAD || Math.abs(P.y - ecy) > item.h / 2 + PAD)
					continue;
				const c: Candidate = { kind: "el", item };
				consider(c, geometry(c));
			}
			if (nodesOK() && field) {
				const v = field.view();
				const ns = field.nodes();
				for (const sh of field.shapes()) {
					const n = ns[sh.id];
					if (!n) continue;
					if (
						Math.abs(P.x - (sh.x + n.qx * v.s)) > sh.w / 2 + PAD ||
						Math.abs(P.y - (sh.y - sy + n.qy * v.s)) > sh.h / 2 + PAD
					)
						continue;
					const c: Candidate = { kind: "shape", shape: sh };
					consider(c, geometry(c));
				}
				for (let i = 0; i < ns.length; i++) {
					const n = ns[i] as FieldNodeLike;
					if (n.fixed || n.kind === "cap") continue;
					const R = n.R * v.s + PAD;
					if (Math.abs(P.x - (n.x - v.x) * v.s) > R || Math.abs(P.y - (n.y - v.y) * v.s) > R)
						continue;
					const c: Candidate = { kind: "node", id: i };
					consider(c, geometry(c));
				}
			}
		}
		const b = best as Geo | null;
		const bc = bestC as Candidate | null;
		// dock, hold and release (with hysteresis; a fast pass over a node does not dock)
		if (
			target &&
			b &&
			bc &&
			bc !== target &&
			bestD < 0 &&
			bc.kind === "el" &&
			(target.kind !== "el" || !(under && target.item.el.contains(under)))
		) {
			dock(bc); // an element on top takes over at once
		}
		if (target) {
			const gt = geometry(target);
			if (
				!active ||
				(!nodesOK() && target.kind !== "el") ||
				!gt.vis ||
				edgeDistance(gt, P.x, P.y) > LEAVE * Math.max(Math.min(gt.w, gt.h) / 2, MIN_R)
			) {
				release();
			}
		} else if (b && bc && bestD < 0 && speed < FAST) {
			dwell += dt;
			if (dwell >= DWELL) {
				dock(bc);
				dwell = 0;
			}
		} else dwell = 0;

		// the free ring: trails the dot; near a shape it leans toward it while the shape leans toward the dot by the same distance
		let tx = P.x;
		let ty = P.y;
		let tw = RING;
		let th = RING;
		if (target) {
			const g = geometry(target);
			lastG = g;
			const hx = P.x - g.hx;
			const hy = P.y - g.hy;
			const hd = Math.hypot(hx, hy) || 1; // from where the shape would be unpulled
			const amount = Math.min(
				MEET * hd,
				(MAX_PULL * Math.min(g.w, g.h)) / 2,
				g.el ? LEAN_MAX : Number.POSITIVE_INFINITY,
			);
			pull(g, (hx / hd) * amount, (hy / hd) * amount);
		} else if (b && bestD > 0 && bestD < ZONE) {
			const k = smooth(1 - bestD / ZONE);
			const ax = b.cx - P.x;
			const ay = b.cy - P.y;
			const ad = Math.hypot(ax, ay) || 1;
			const shift = 0.35 * k * ad;
			tx = P.x + (ax / ad) * shift;
			ty = P.y + (ay / ad) * shift;
			tw = RING + (Math.min(b.w, 160) - RING) * 0.25 * k;
			th = RING + (Math.min(b.h, 160) - RING) * 0.25 * k;
			const lean = Math.min(
				shift,
				(MAX_PULL * Math.min(b.w, b.h)) / 2,
				b.el ? LEAN_MAX : Number.POSITIVE_INFINITY,
			);
			pull(b, (-ax / ad) * lean, (-ay / ad) * lean);
		} else pull(null, 0, 0);
		X.step(tx, 26, 1, dt);
		Y.step(ty, 26, 1, dt);
		W.step(tw, 26, 1, dt);
		H.step(th, 26, 1, dt);
		stepStretch(str, X.vel, Y.vel, !!target, dt);

		// docking: the ring grows into the shape (spring, small overshoot) and then IS the shape, exactly: same centre, size and
		// outline, however it moves, until the pointer leaves
		L.step(target ? 1 : 0, 22, 0.62, dt);
		if (target && Math.abs(L.v - 1) < 0.003 && Math.abs(L.vel) < 0.1) {
			L.v = 1;
			L.vel = 0;
		}
		if (!target && L.v < 0.003 && Math.abs(L.vel) < 0.1) {
			L.v = 0;
			L.vel = 0;
			lastG = null;
		}

		// everything at rest (nothing docked or leaning, ring on the dot, no shape nearby): snap, draw once more and go to sleep
		const still =
			!target &&
			!lastG &&
			!pulled.length &&
			!elState.size &&
			!(b && bestD < ZONE) &&
			str.s < 0.003 &&
			Math.abs(X.v - tx) < 0.1 &&
			Math.abs(Y.v - ty) < 0.1 &&
			Math.abs(W.v - tw) < 0.1 &&
			Math.abs(H.v - th) < 0.1 &&
			Math.abs(X.vel) + Math.abs(Y.vel) + Math.abs(W.vel) + Math.abs(H.vel) < 2;
		if (still) {
			X.v = tx;
			Y.v = ty;
			W.v = tw;
			H.v = th;
			X.vel = 0;
			Y.vel = 0;
			W.vel = 0;
			H.vel = 0;
			str.s = 0;
		}

		const lg = lastG as Geo | null;
		const m = lg ? L.v : 0;
		const cx = X.v + ((lg ? lg.cx : 0) - X.v) * m;
		const cy = Y.v + ((lg ? lg.cy : 0) - Y.v) * m;
		const cw = W.v + ((lg ? lg.w : 0) - W.v) * m;
		const ch = H.v + ((lg ? lg.h : 0) - H.v) * m;
		const free = 1 - Math.min(1, Math.max(0, m));
		const sx = 1 + str.s * free;
		const sy2 = 1 - str.s * 0.45 * free;
		// styles are written only when they changed (a settled or free ring of constant size costs one transform write)
		const rw = Math.round(Math.max(cw, 2) * 10) / 10;
		const rh = Math.round(Math.max(ch, 2) * 10) / 10;
		if (rw !== last.rw) {
			ring.style.width = `${rw}px`;
			last.rw = rw;
		}
		if (rh !== last.rh) {
			ring.style.height = `${rh}px`;
			last.rh = rh;
		}
		const rFree = Math.min(W.v, H.v) / 2;
		const cr = rFree + ((lg ? lg.r : rFree) - rFree) * m;
		const rr = Math.round(Math.max(0, Math.min(cr, Math.min(cw, ch) / 2)) * 10) / 10;
		if (rr !== last.rr) {
			ring.style.borderRadius = `${rr}px`;
			last.rr = rr;
		}
		// stretch along the travel axis (rotate, scale, rotate back): the shape itself is never rotated
		const rt =
			str.s < 0.002
				? `translate3d(${cx.toFixed(2)}px,${cy.toFixed(2)}px,0) translate(-50%,-50%)`
				: `translate3d(${cx.toFixed(2)}px,${cy.toFixed(2)}px,0) rotate(${str.a.toFixed(3)}rad) scale(${sx.toFixed(3)},${sy2.toFixed(3)}) rotate(${(-str.a).toFixed(3)}rad) translate(-50%,-50%)`;
		if (rt !== last.rt) {
			ring.style.transform = rt;
			last.rt = rt;
		}
		// the glow: exactly where the pointer is, inside the outline (its position is relative to the ring's inner corner); it is
		// only visible, and only moved, while docked
		if (m > 0.001) {
			const gtf = `translate3d(${(P.x - (cx - cw / 2) - BORDER).toFixed(2)}px,${(P.y - (cy - ch / 2) - BORDER).toFixed(2)}px,0) translate(-50%,-50%)`;
			if (gtf !== last.gt) {
				glow.style.transform = gtf;
				last.gt = gtf;
			}
		}
		if (active !== last.on) {
			host.classList.toggle("on", active);
			last.on = active;
		}
		sleeping = still;
		return still ? "sleep" : undefined;
	}

	const task: Task = scheduler.add({ phase: "write", run });

	const cleanups: (() => void)[] = [];
	const on = <K extends keyof WindowEventMap>(
		type: K,
		fn: (e: WindowEventMap[K]) => void,
		o?: AddEventListenerOptions | boolean,
	) => {
		window.addEventListener(type, fn, o);
		cleanups.push(() => window.removeEventListener(type, fn, o));
	};

	on(
		"pointermove",
		(e) => {
			if (e.pointerType === "touch") return;
			const now = performance.now();
			const dtm = Math.max(1, now - lastMove) / 1000;
			if (lastMove)
				speed = Math.max(
					speed * 0.5,
					0.5 * speed + (0.5 * Math.hypot(e.clientX - P.x, e.clientY - P.y)) / dtm,
				);
			lastMove = now;
			if (P.x < -50) {
				X.v = e.clientX;
				Y.v = e.clientY;
				X.vel = Y.vel = 0; // only the very first appearance
			}
			P.x = e.clientX;
			P.y = e.clientY;
			dot.style.transform = `translate3d(${P.x}px,${P.y}px,0) translate(-50%,-50%)`; // the real pointer: written at once
			setUnder(e.target as Element | null);
			needText = true; // the text beam is worked out in the next update, once per frame however many events arrive
			kick();
		},
		{ passive: true },
	);
	const leave = () => {
		active = false;
		under = null;
		beamH = 0;
		dot.classList.remove("beam");
		host.classList.remove("text");
		kick();
	};
	document.documentElement.addEventListener("mouseleave", leave);
	cleanups.push(() => document.documentElement.removeEventListener("mouseleave", leave));
	on("pointerdown", (e) => {
		if (e.button === 0 && target) host.classList.add("press");
	});
	on("pointerup", () => host.classList.remove("press"));
	on(
		"click",
		() => {
			if (!target) return;
			const g = geometry(target);
			const rp = document.createElement("div");
			rp.className = "cur-ripple";
			rp.style.cssText = `width:${g.w}px;height:${g.h}px;border-radius:${g.r}px;left:${g.cx}px;top:${g.cy}px`;
			host.appendChild(rp);
			const a = rp.animate(
				[
					{ transform: "translate(-50%,-50%) scale(1)", opacity: 0.7 },
					{ transform: "translate(-50%,-50%) scale(1.35)", opacity: 0 },
				],
				{ duration: 450, easing: "cubic-bezier(.2,.7,.2,1)" },
			);
			a.onfinish = () => rp.remove();
		},
		true,
	);
	// the pointer's place is kept across pages, so the ring does not start in a corner on the next one
	on("pagehide", () => {
		try {
			if (P.x > -50) sessionStorage.setItem(PIN_KEY, JSON.stringify({ x: P.x, y: P.y }));
		} catch {
			// not kept
		}
	});
	try {
		const saved = JSON.parse(sessionStorage.getItem(PIN_KEY) ?? "null") as {
			x: number;
			y: number;
		} | null;
		if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
			P.x = saved.x;
			P.y = saved.y;
			X.v = saved.x;
			Y.v = saved.y;
			dot.style.transform = `translate3d(${P.x}px,${P.y}px,0) translate(-50%,-50%)`;
			needUnder = true;
		}
	} catch {
		// nothing kept
	}
	registry.onchange = kick;
	// a still pointer re-checks a few times a second while the field is on, because its nodes drift under it
	const recheck = window.setInterval(() => {
		if (field && enabled && active) task.wake();
	}, 250);

	return {
		setField(port) {
			if (!port) release();
			field = port;
			kick();
		},
		setEnabled(v) {
			enabled = v;
			if (!enabled) release();
			kick();
		},
		retarget() {
			if (P.x < -50) return;
			needUnder = true;
			kick();
		},
		docked() {
			return target?.kind === "node" ? target.id : -1;
		},
		destroy() {
			release();
			task.remove();
			for (const c of cleanups) c();
			clearInterval(recheck);
			registry.destroy();
			for (const el of elState.keys()) el.style.translate = "";
			host.remove();
			root.classList.remove("has-cursor");
		},
	};
}

export function cursorAvailable(): boolean {
	return matchMedia("(hover: hover) and (pointer: fine)").matches;
}
