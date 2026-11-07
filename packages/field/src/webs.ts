/** The webs between nodes: deciding which exist, growing and drawing them, and drawing the nodes themselves. */
import { edgeEls } from "./build-dom.ts";
import { manageExpansion, renderExpansion } from "./expansion.ts";
import {
	angDist,
	bossPath,
	DEG,
	edgeGeom,
	kidneyPath,
	n2,
	type Opening,
	outline,
	outlineD,
	samplePoints,
	segSegIntersect,
	slotFor,
	slotPath,
	TAU,
} from "./geometry.ts";
import { segHitsRects } from "./layout.ts";
import { clamp, distSeg, easeInOut, easeOut, smooth } from "./math.ts";
import { mix } from "./palette.ts";
import { capAngle, type Sim } from "./sim.ts";
import type { FieldEdge, FieldNode } from "./types.ts";

/** Decide, about ten times a second, which webs want to exist. */
export function evalEdges(sim: Sim): void {
	const { S } = sim;
	const ns = S.nodes;
	const list = S.edges;
	let order = list.map((e) => {
		const a = ns[e.i] as FieldNode;
		const b = ns[e.j] as FieldNode;
		e.gapNow = Math.hypot(a.x - b.x, a.y - b.y) - a.R - b.R;
		return e;
	});
	order = order.filter(
		(e) =>
			e.ed.bonded ||
			e.u > 0 ||
			e.c > 0.01 ||
			(e.gapNow as number) < ((ns[e.i] as FieldNode).R + (ns[e.j] as FieldNode).R) * 1.5,
	);
	order.sort(
		(p, q) =>
			q.u - p.u ||
			(q.ed.bonded ? 1 : 0) - (p.ed.bonded ? 1 : 0) ||
			(p.gapNow as number) - (q.gapNow as number),
	);
	const accepted: FieldEdge[] = [];
	const open: { a: number; th: number }[][] = ns.map((n) =>
		n.kind === "cap" ? [{ a: capAngle(S, n), th: Math.PI / 2 }] : [],
	);
	const pts: number[] = [];
	for (const e of order) {
		const a = ns[e.i] as FieldNode;
		const b = ns[e.j] as FieldNode;
		const bonded = e.ed.bonded;
		const sum = a.R + b.R;
		const gapOn = (a.fixed || b.fixed ? 1.9 : 0.9) * sum;
		const gapOff = (a.fixed || b.fixed ? 2.4 : 1.2) * sum;
		let g = edgeGeom(a, b, e.ed, { RbMax: bonded ? 640 : 430, minLen: 56 });
		let want = false;
		let hard = !g;
		let near = false;
		let blocked = false;
		if (a.expDir || a.expU > 0.001 || b.expDir || b.expU > 0.001) {
			g = null;
			hard = true;
		}
		if (g && S.rects.length && segHitsRects(S, a.x, a.y, b.x, b.y)) {
			g = null;
			hard = true;
		}
		if (g) {
			const lim = bonded ? Number.POSITIVE_INFINITY : e.dir ? gapOff : gapOn;
			const reach = g.gap <= lim;
			near = !bonded && g.gap <= gapOn * 1.3;
			if (reach) {
				// clearance from every other boss
				pts.length = 0;
				const o1 = outline(a, b, g, 1);
				const o2 = outline(a, b, g, -1);
				samplePoints(o1, pts, 6);
				samplePoints(o2, pts, 6);
				let clear = true;
				for (let k = 0; k < ns.length && clear; k++) {
					if (k === e.i || k === e.j) continue;
					const c = ns[k] as FieldNode;
					if (distSeg(c.x, c.y, a.x, a.y, b.x, b.y) < c.R + 10) {
						clear = false;
						break;
					}
					for (let p = 0; p < pts.length; p += 2) {
						if (Math.hypot((pts[p] as number) - c.x, (pts[p + 1] as number) - c.y) < c.R + 9) {
							clear = false;
							break;
						}
					}
				}
				let conflict = false;
				if (clear) {
					for (let f = 0; f < accepted.length && !conflict; f++) {
						const af = accepted[f] as FieldEdge;
						if (af.i === e.i || af.i === e.j || af.j === e.i || af.j === e.j) continue;
						const A = ns[af.i] as FieldNode;
						const B = ns[af.j] as FieldNode;
						if (segSegIntersect(a.x, a.y, b.x, b.y, A.x, A.y, B.x, B.y)) conflict = true;
					}
					const oa = open[e.i] as { a: number; th: number }[];
					const ob = open[e.j] as { a: number; th: number }[];
					const ma = 0.006;
					for (let q = 0; q < oa.length && !conflict; q++) {
						const o = oa[q] as { a: number; th: number };
						if (angDist(o.a, g.ang) < o.th + g.thA + ma) conflict = true;
					}
					for (let r = 0; r < ob.length && !conflict; r++) {
						const o = ob[r] as { a: number; th: number };
						if (angDist(o.a, g.ang + Math.PI) < o.th + g.thB + ma) conflict = true;
					}
				}
				if (clear && !conflict) {
					want = true;
					accepted.push(e);
					(open[e.i] as { a: number; th: number }[]).push({ a: g.ang, th: g.thA });
					(open[e.j] as { a: number; th: number }[]).push({ a: g.ang + Math.PI, th: g.thB });
				} else {
					blocked = true;
					if (!clear) hard = true;
				}
			}
		}
		e.near = near && !!g;
		e.blocked = blocked;
		if (want) {
			e.onC++;
			e.offC = 0;
			if (!e.dir && e.onC >= (bonded ? 2 : 4)) e.dir = 1;
		} else {
			e.offC++;
			e.onC = 0;
			if (e.dir && (hard || e.offC >= 5)) e.dir = 0;
		}
	}
	manageExpansion(sim);
	// edges filtered out above are far apart: make sure they are off
	for (const e of list) {
		if (!order.includes(e)) {
			e.dir = 0;
			e.near = false;
		}
	}
}

/** Grow the webs, and draw the webs and the nodes. */
export function updateEdges(sim: Sim, dt: number): void {
	const { S } = sim;
	const ns = S.nodes;
	for (const e of S.edges) {
		const rate = e.dir ? 1 / 1.9 : 1 / 1.15;
		if (S.introHold) {
			// entrance: a web is drawn together with its nodes, as far as the later of the two has been drawn
			const pi = (ns[e.i] as FieldNode).penV;
			const pj = (ns[e.j] as FieldNode).penV;
			const k = e.dir ? Math.min(pi === undefined ? 1 : pi, pj === undefined ? 1 : pj) : 0;
			e.u = k;
			e.c = k;
		} else {
			e.u = clamp(e.u + (e.dir ? rate : -rate) * dt, 0, 1);
		}
		e.prevU = e.u;
		e.glow = e.glow > 0.004 ? e.glow * Math.exp(-dt * 1.5) : 0;
		const ct = e.dir ? 1 : 0; // construction lines only join notes that are connected
		if (!S.introHold) {
			e.c += (ct - e.c) * (1 - Math.exp(-dt * 2.6));
			if (e.c < 0.003 && !ct) e.c = 0;
		}
		if (e.pulseP >= 0) {
			e.pulseP += dt / 0.8;
			if (e.pulseP > 1.15) e.pulseP = -1;
		}
	}
	// boss openings and per-edge drawing
	const open: Opening[][] = ns.map((n) =>
		n.kind === "cap" ? [{ a: capAngle(S, n), w: Math.PI / 2 }] : [],
	);
	for (const e of S.edges) {
		const vis = e.u > 0.002 || e.c > 0.004;
		if (!vis) {
			if (e.els?.shown) {
				e.els.cl.style.display = "none";
				e.els.cp.style.display = "none";
				e.els.o1.style.display = "none";
				e.els.o2.style.display = "none";
				e.els.sl.style.display = "none";
				e.els.shown = false;
			}
			e.g = null;
			continue;
		}
		const a = ns[e.i] as FieldNode;
		const b = ns[e.j] as FieldNode;
		const els = edgeEls(sim, e);
		if (!els.shown) {
			els.cl.style.display = "";
			els.cp.style.display = "";
			els.o1.style.display = "";
			els.o2.style.display = "";
			els.sl.style.display = "";
			els.shown = true;
		}
		const d0 = `M${n2(a.x)} ${n2(a.y)}L${n2(b.x)} ${n2(b.y)}`;
		els.cl.setAttribute("d", d0);
		els.cl.setAttribute("opacity", (0.55 * easeInOut(e.c)).toFixed(3));
		const g = edgeGeom(a, b, e.ed, { RbMax: 1600, minLen: 18 });
		e.g = g;
		if (!g) {
			if (e.u > 0) e.u = Math.max(0, e.u - 0.06);
			els.o1.setAttribute("visibility", "hidden");
			els.o2.setAttribute("visibility", "hidden");
			els.sl.setAttribute("visibility", "hidden");
			els.cp.setAttribute("visibility", "hidden");
			continue;
		}
		// pulse travelling along the centre line
		if (e.pulseP >= 0) {
			const head = clamp(e.pulseP, 0, 1);
			const tail = 0.18;
			els.cp.setAttribute(
				"d",
				e.pulseDir > 0 ? d0 : `M${n2(b.x)} ${n2(b.y)}L${n2(a.x)} ${n2(a.y)}`,
			);
			els.cp.setAttribute("stroke-dasharray", `${tail} 4`);
			els.cp.setAttribute("stroke-dashoffset", (tail - head).toFixed(4));
			els.cp.setAttribute("opacity", (0.9 * Math.sin(Math.PI * clamp(e.pulseP, 0, 1))).toFixed(3));
			els.cp.setAttribute("visibility", "visible");
		} else els.cp.setAttribute("visibility", "hidden");
		if (e.u <= 0.002) {
			els.o1.setAttribute("visibility", "hidden");
			els.o2.setAttribute("visibility", "hidden");
			els.sl.setAttribute("visibility", "hidden");
			continue;
		}
		const s = easeInOut(e.u);
		const eo = easeOut(Math.min(1, e.u / 0.6));
		(open[e.i] as Opening[]).push({ a: g.ang, w: g.thA * eo });
		(open[e.j] as Opening[]).push({ a: g.ang + Math.PI, w: g.thB * eo });
		const o1 = outline(a, b, g, 1);
		const o2 = outline(a, b, g, -1);
		const da = 0.5 * s;
		const dash =
			da >= 0.4995 ? "none" : `${da.toFixed(4)} ${(1 - 2 * da).toFixed(4)} ${da.toFixed(4)} 2`;
		els.o1.setAttribute("d", outlineD(o1));
		els.o2.setAttribute("d", outlineD(o2));
		const vsb = da < 0.0015 ? "hidden" : "visible";
		els.o1.setAttribute("visibility", vsb);
		els.o2.setAttribute("visibility", vsb);
		els.o1.setAttribute("stroke-dasharray", dash);
		els.o2.setAttribute("stroke-dasharray", dash);
		if (e.glow > 0.01 || e.glowOn) {
			const gc = mix("outline", e.glow * 0.9);
			els.o1.setAttribute("stroke", gc);
			els.o2.setAttribute("stroke", gc);
			e.glowOn = e.glow > 0.01;
		}
		// slot grows from its centre once the web has formed
		const shift = S.amp * Math.sin(S.t * 0.33 + e.i * 1.7 + e.j) * 9;
		const sl = slotFor(a, b, g, e.ed, shift);
		if (sl) {
			const grow = smooth((e.u - 0.72) / 0.28);
			const spath = slotPath(a, g, sl, grow);
			els.sl.setAttribute("d", spath);
			els.sl.setAttribute("visibility", spath ? "visible" : "hidden");
		} else els.sl.setAttribute("visibility", "hidden");
	}
	// nodes: boss with openings, concentric rings, details, construction
	const act: (number | undefined)[] = [];
	for (const e of S.edges) {
		if (e.u > 0.02) {
			act[e.i] = 1;
			act[e.j] = 1;
		}
	}
	for (const n of ns) {
		const E = n.els;
		const NG = n.ng;
		if (!E || !NG || !n.n0) continue;
		const tr = `translate(${n2(n.x)} ${n2(n.y)})`;
		NG.c.setAttribute("transform", tr);
		NG.p.setAttribute("transform", tr);
		NG.r.setAttribute("transform", tr);
		NG.a.setAttribute("transform", tr);
		E.boss.setAttribute("d", bossPath(n.n0, open[n.id] as Opening[]));
		if (E.body && E.bodyAxis) {
			const q2 = ns[n.partner] as FieldNode;
			const bdx = q2.x - n.x;
			const bdy = q2.y - n.y;
			E.body.setAttribute(
				"d",
				`M0 ${n2(-n.R)}L${n2(bdx)} ${n2(bdy - n.R)}M0 ${n2(n.R)}L${n2(bdx)} ${n2(bdy + n.R)}`,
			);
			E.bodyAxis.setAttribute("d", `M${n2(-n.R - 14)} 0L${n2(bdx + n.R + 14)} ${n2(bdy)}`);
		}
		// construction axes (local frame: only change when the detent turns)
		const rot = n.style === "plain" ? n.ang + n.chainSpin : 0;
		const L = n.R + 32;
		const cr = Math.cos(rot);
		const sr = Math.sin(rot);
		E.ax1.setAttribute("d", `M${n2(-cr * L)} ${n2(-sr * L)}L${n2(cr * L)} ${n2(sr * L)}`);
		E.ax2.setAttribute("d", `M${n2(sr * L)} ${n2(-cr * L)}L${n2(-sr * L)} ${n2(cr * L)}`);
		if (n.style === "holes") {
			const nh = n.nh ?? 0;
			const pitch = n.pitch ?? 0;
			const hole = n.hole ?? 0;
			for (let k = 0; k < nh; k++) {
				const ang = n.a0 + k * (TAU / nh) + n.ang + n.chainSpin;
				const hx = Math.cos(ang) * pitch;
				const hy = Math.sin(ang) * pitch;
				const ring = E.holes[k];
				const cross = E.cross2[k];
				if (!ring || !cross) continue;
				ring.setAttribute("cx", n2(hx));
				ring.setAttribute("cy", n2(hy));
				cross.setAttribute(
					"d",
					`M${n2(hx - hole - 2)} ${n2(hy)}H${n2(hx + hole + 2)}M${n2(hx)} ${n2(hy - hole - 2)}V${n2(hy + hole + 2)}`,
				);
			}
		} else if (n.style === "kidney") {
			const half = (14 + 2.6 * Math.sin(S.t * 0.55 + n.breathe)) * DEG;
			for (let q = 0; q < 3; q++) {
				const base = 15 * DEG + q * (TAU / 3) + n.ang + n.chainSpin;
				E.kid[q]?.setAttribute(
					"d",
					kidneyPath(0, 0, n.pitch ?? 0, n.cap, base - half, base + half),
				);
			}
		}
		renderExpansion(sim, n, E, S.dtLast || 0, act);
		// emphasis (hover / pulse)
		const v = Math.max(n.hot * 0.85, n.pulse);
		if (Math.abs(v - n.vis) > 0.004) {
			n.vis = v;
			E.boss.setAttribute("stroke", mix("outline", v));
			E.boss.setAttribute("stroke-width", (2.4 * (1 + 0.55 * v)).toFixed(2));
			if (E.r1) {
				E.r1.setAttribute("stroke", mix("ring", v));
				E.r1.setAttribute("stroke-width", (2 * (1 + 0.5 * v)).toFixed(2));
			}
			if (E.r2) {
				E.r2.setAttribute("stroke", mix("ring", v));
				E.r2.setAttribute("stroke-width", (2 * (1 + 0.5 * v)).toFixed(2));
			}
			if (E.body) {
				E.body.setAttribute("stroke", mix("outline", v));
				E.body.setAttribute("stroke-width", (2.4 * (1 + 0.55 * v)).toFixed(2));
			}
			if (E.xa && E.xb) {
				E.xa.setAttribute("stroke", mix("ring", v));
				E.xb.setAttribute("stroke", mix("ring", v));
				E.xa.setAttribute("stroke-width", (2 * (1 + 0.5 * v)).toFixed(2));
				E.xb.setAttribute("stroke-width", (2 * (1 + 0.5 * v)).toFixed(2));
			}
			const ap = mix("ring", v * 0.8);
			for (const h of E.holes) h.setAttribute("stroke", ap);
			for (const k of E.kid) k.setAttribute("stroke", ap);
		}
	}
}
