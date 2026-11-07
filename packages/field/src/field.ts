/*
 * The live assembly: a cloud of nodes (the master's centres, laid out around the page) floats slowly. Whenever two nodes are near
 * and the path between them is clear, a web grows between them using the master's own construction rules (see geometry.ts).
 * Dimension labels are read from the live geometry, and appear and retire by rule, not by chance.
 *
 * Every frame is a valid drawing: shared centres stay exactly concentric and every outline is rebuilt tangent. Nothing is
 * deformed: nodes move as rigid bearings, and the webs follow them.
 *
 * The field does not run itself: whoever hosts it calls `step` at the pace it wants (see the frame scheduler).
 */
import { buildDom } from "./build-dom.ts";
import { manageChains, updateChains } from "./chains.ts";
import { labelStep, labelTick } from "./labels.ts";
import { assignSatellites, buildEdges, buildNodes, layoutHome } from "./layout.ts";
import { clamp, createRng } from "./math.ts";
import { stepNodes } from "./motion.ts";
import { pulseFrom, runFires } from "./pulses.ts";
import type { VEl } from "./scene.ts";
import { createGroups, createState, GROUP_ORDER, type Sim, type State } from "./sim.ts";
import type { Layout } from "./types.ts";
import { evalEdges, updateEdges } from "./webs.ts";

export type FieldOptions = { seed?: number; maxLabels?: number };

const EDGE_PARTS = ["cl", "cp", "o1", "o2", "sl"] as const;
const NODE_LAYERS = ["c", "p", "r", "a"] as const;

export type Field = ReturnType<typeof createField>;

export function createField(opts: FieldOptions = {}) {
	const GR = createGroups();
	const S: State = createState(opts.maxLabels || 8);
	const sim: Sim = { S, rand: createRng(opts.seed || 20260505), GR, seen: {} };

	/** Advance the simulation by dt seconds; `noRender` skips the labels (used while building). */
	function step(dt: number, noRender = false): void {
		S.dtLast = dt;
		S.amp = Math.min(1, S.amp + dt * 0.28); // the drift eases in after a build
		S.t += dt;
		stepNodes(sim, dt);
		if (!S.introHold) runFires(sim);
		S.evalAcc += dt;
		if (S.evalAcc >= 0.1) {
			S.evalAcc = 0;
			evalEdges(sim);
			if (!S.introHold) manageChains(sim);
		}
		updateEdges(sim, dt);
		updateChains(sim, dt);
		if (!noRender && !S.introHold) {
			labelStep(sim, dt);
			S.labelAcc += dt;
			if (S.labelAcc >= 0.35) {
				S.labelAcc = 0;
				labelTick(sim);
			}
		}
	}

	function hitNode(x: number, y: number): number {
		let best = -1;
		let bd = 1e9;
		for (const n of S.nodes) {
			if (n.fixed) continue;
			const d = Math.hypot(x - n.x, y - n.y);
			if (d < n.R * 1.02 && d / n.R < bd) {
				bd = d / n.R;
				best = n.id;
			}
		}
		return best;
	}

	const api = {
		state: S,
		/** The drawing layers, bottom to top, for the renderer. */
		roots: GROUP_ORDER.map((id) => GR[id]) as VEl[],

		build(layout: Layout): void {
			S.introHold = false;
			buildNodes(S, layout, sim.rand);
			layoutHome(S, layout, sim.rand);
			assignSatellites(S, layout);
			buildEdges(S);
			buildDom(sim);
			S.t = 0;
			S.amp = 0;
			S.labels = [];
			S.fires = [];
			S.chains = [];
			S.nextChain = 6;
			S.evalAcc = 0;
			evalEdges(sim);
			evalEdges(sim);
			for (const e of S.edges) {
				e.u = e.dir ? 1 : 0;
				e.c = e.dir ? 1 : 0;
				e.prevU = e.u;
			}
			step(0, true);
		},

		step,

		/** Deterministic fast-forward (for stills and tests). */
		advance(seconds: number): void {
			const dt = 1 / 30;
			const n = Math.round(seconds / dt);
			for (let i = 0; i < n; i++) {
				step(dt, true);
				labelStep(sim, dt);
				S.labelAcc += dt;
				if (S.labelAcc >= 0.35) {
					S.labelAcc = 0;
					labelTick(sim);
				}
			}
		},

		setView(x: number, y: number, w: number, h: number): void {
			S.view.x = x;
			S.view.y = y;
			S.view.w = w;
			S.view.h = h;
		},

		hit: hitNode,

		/**
		 * The page scrolled to this many world units: the anchored nodes (logo, buttons) move with the page's elements, all the
		 * others more slowly; every node moves at once so nothing waits for the next step. Returns whether anything moved.
		 */
		setScroll(w: number): boolean {
			const d = w - S.scroll;
			if (!d) return false;
			S.scroll = w;
			for (const n of S.nodes) n.y -= d * (n.fixed ? 1 : S.parK);
			return true;
		},

		/** True when every node has scrolled above the top of the view. */
		allAbove(): boolean {
			return S.nodes.every((n) => n.y + n.R < S.view.y);
		},

		pointer(x: number, y: number, inside: boolean): void {
			S.hover = inside ? hitNode(x, y) : -1;
		},

		/**
		 * The cursor pulls a node (or several, as one body) toward it by (x, y) world units (0, 0 lets it go); the spring is
		 * under-damped, so it settles with a small overshoot.
		 */
		attract(ids: number | number[], x: number, y: number): void {
			for (const id of ([] as number[]).concat(ids)) {
				const n = S.nodes[id];
				if (n) {
					n.ptx = x;
					n.pty = y;
				}
			}
		},

		satIds(): Record<string, number> {
			return S.satIds;
		},

		setHot(id: number, on: boolean): void {
			const n = S.nodes[id];
			if (n) n.extraHot = on ? 1 : 0;
		},

		pulse(id: number): void {
			pulseFrom(sim, id);
		},

		/* ---- entrance: every node starts undrawn and is drawn like a pen along its outlines; the webs wait */
		introBegin(): void {
			S.introHold = true;
			for (const e of S.edges) {
				e.u = 0;
				e.c = 0;
				e.prevU = 0;
				e.g = null;
				if (e.els?.shown) {
					// already built at u = 1: hide now, so not even one frame shows them
					for (const k of EDGE_PARTS) e.els[k].style.display = "none";
					e.els.shown = false;
				}
			}
			for (const n of S.nodes) api.setPen(n.id, 0);
		},

		/** p: 0..1 how much of the node has been drawn; the outline goes first, then rings and holes, then the construction lines. */
		setPen(id: number, p: number): void {
			const n = S.nodes[id];
			if (!n?.els) return;
			n.penV = p;
			const e = n.els;
			const put = (el: VEl | undefined, a?: number, b?: number): void => {
				if (!el) return;
				el.setAttribute(
					"pen",
					a === undefined || b === undefined ? p : clamp((p - a) / (b - a), 0, 1),
				);
			};
			put(e.boss, 0, 0.5);
			put(e.body, 0, 0.5);
			put(e.r1, 0.15, 0.7);
			put(e.r2, 0.25, 0.8);
			put(e.pitch, 0.4, 0.9);
			put(e.ax1, 0.55, 1);
			put(e.ax2, 0.55, 1);
			put(e.bodyAxis, 0.55, 1);
			put(e.cross, 0.75, 1);
			for (const h of e.holes) put(h, 0.45, 0.95);
			for (const h of e.kid) put(h, 0.45, 0.95);
			for (const h of e.cross2) put(h, 0.8, 1);
		},

		/**
		 * The entrance is skipped: what has been drawn so far stays as it is; the rest is switched to its finished state at the
		 * alpha it had (nothing at all for what was not started) and fades in from there (setFade).
		 */
		introFinish(): void {
			for (const n of S.nodes) n.fade0 = clamp(n.penV === undefined ? 1 : n.penV, 0, 1);
			for (const e of S.edges) e.fade0 = clamp(e.u, 0, 1);
			api.introEnd();
			for (const e of S.edges) {
				e.u = e.dir ? 1 : 0;
				e.c = e.dir ? 1 : 0;
				e.prevU = e.u;
			}
			updateEdges(sim, 0); // builds the webs' elements now, so the first frame already has them at their starting alpha
			api.setFade(0);
		},

		/** t: 0..1 progress of the fade that follows `introFinish`. */
		setFade(t: number): void {
			const put = (el: VEl | undefined, v: number): void => el?.setAttribute("fade", v);
			for (const n of S.nodes) {
				if (!n.ng || n.fade0 === undefined) continue;
				const v = n.fade0 + (1 - n.fade0) * t;
				for (const k of NODE_LAYERS) put(n.ng[k], v);
			}
			for (const e of S.edges) {
				if (!e.els || e.fade0 === undefined) continue;
				const v = e.fade0 + (1 - e.fade0) * t;
				for (const k of EDGE_PARTS) put(e.els[k], v);
			}
			if (t >= 1) {
				for (const n of S.nodes)
					if (n.ng) for (const k of NODE_LAYERS) n.ng[k].removeAttribute("fade");
				for (const e of S.edges)
					if (e.els) for (const k of EDGE_PARTS) e.els[k].removeAttribute("fade");
			}
		},

		introEnd(): void {
			S.introHold = false;
			for (const n of S.nodes) {
				n.penV = 1;
				if (!n.els) continue;
				const e = n.els;
				const parts = [
					e.boss,
					e.body,
					e.r1,
					e.r2,
					e.pitch,
					e.ax1,
					e.ax2,
					e.bodyAxis,
					e.cross,
					...e.holes,
					...e.kid,
					...e.cross2,
				];
				for (const el of parts) el?.removeAttribute("pen");
			}
		},
	};
	return api;
}
