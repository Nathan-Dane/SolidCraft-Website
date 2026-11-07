/*
 * A small plain node beside a larger one occasionally lets go of its webs and stretches its whole body (boss and rings) into an
 * arc concentric with the larger node.
 */

import { el } from "./build-dom.ts";
import { kidneyPath, n2 } from "./geometry.ts";
import { clamp, distSeg, easeInOut, lerp } from "./math.ts";
import { COL, mix } from "./palette.ts";
import type { Sim } from "./sim.ts";
import type { FieldNode, NodeEls } from "./types.ts";

function expShape(n: FieldNode, L: FieldNode, d: number): { sc: number; dFull: number } {
	// fully expanded: body 38% thinner, and the arc sits closer to its neighbour
	const sc = 0.62;
	const gap0 = d - L.R - n.R;
	return { sc, dFull: L.R + sc * n.R + Math.max(22, 0.55 * gap0) };
}

/** How far (chord half-length) n can stretch along the circle about L before it meets anything. */
function expFeasible({ S }: Sim, n: FieldNode, L: FieldNode): number {
	const ns = S.nodes;
	const dx = n.x - L.x;
	const dy = n.y - L.y;
	let d = Math.hypot(dx, dy) || 1;
	const a = Math.atan2(dy, dx);
	const sh = expShape(n, L, d);
	d = sh.dFull;
	const cap = sh.sc * n.R + 18;
	let best = 0;
	for (let phi = 0.05; phi < 1.7; phi += 0.04) {
		let ok = true;
		for (let sg = -1; sg <= 1 && ok; sg += 2) {
			const px = L.x + Math.cos(a + sg * phi) * d;
			const py = L.y + Math.sin(a + sg * phi) * d;
			for (let rr = 0; rr < S.rects.length && ok; rr++) {
				const rc = S.rects[rr] as [number, number, number, number];
				if (px > rc[0] - cap && px < rc[2] + cap && py > rc[1] - cap && py < rc[3] + cap)
					ok = false;
			}
			for (let k = 0; k < ns.length && ok; k++) {
				if (k === n.id || k === L.id) continue;
				const m = ns[k] as FieldNode;
				if (Math.hypot(px - m.x, py - m.y) < m.R + cap) ok = false;
			}
			for (let q = 0; q < S.edges.length && ok; q++) {
				const e = S.edges[q];
				if (!e || e.u < 0.3 || e.i === n.id || e.j === n.id) continue;
				const A = ns[e.i] as FieldNode;
				const B = ns[e.j] as FieldNode;
				if (distSeg(px, py, A.x, A.y, B.x, B.y) < n.R + 24) ok = false;
			}
		}
		if (!ok) break;
		best = 2 * d * Math.sin(phi / 2);
	}
	return Math.min(best, 2.0 * n.R);
}

export function manageExpansion(sim: Sim): void {
	const { S, rand } = sim;
	const ns = S.nodes;
	for (const n of ns) {
		if (n.expDir) {
			const L = ns[n.host] as FieldNode;
			n.feas = expFeasible(sim, n, L);
			const near = Math.hypot(n.x - L.x, n.y - L.y) - n.R - L.R <= 1.35 * (n.R + L.R);
			if (S.t > n.expUntil || !near || n.feas < 0.4 * n.R) {
				n.expDir = 0;
				n.expNext = S.t + 28 + rand() * 26;
			}
		} else if (
			S.t > n.expNext &&
			n.expU === 0 &&
			n.style === "plain" &&
			!n.fixed &&
			n.kind !== "sat" &&
			!n.inChain
		) {
			let best = -1;
			let bestLen = 0;
			for (const L of ns) {
				if (L.id === n.id || n.R > 0.72 * L.R || ns.some((m) => m.expDir && m.host === L.id))
					continue;
				if (Math.hypot(n.x - L.x, n.y - L.y) - n.R - L.R > 1.0 * (n.R + L.R)) continue;
				const f = expFeasible(sim, n, L);
				if (f > bestLen) {
					bestLen = f;
					best = L.id;
				}
			}
			if (best >= 0 && bestLen >= 0.9 * n.R && rand() < 0.2) {
				n.host = best;
				n.feas = bestLen;
				n.lenCur = bestLen;
				n.expDir = 1;
				n.expUntil = S.t + 12 + rand() * 6;
			} else n.expNext = S.t + 8 + rand() * 8;
		}
	}
}

function show(
	e: { setAttribute(k: string, v: string): void } | undefined,
	v: "visible" | "hidden",
): void {
	e?.setAttribute("visibility", v);
}

/** Draws a node that is stretching (or has just stopped), and eases its stretch. */
export function renderExpansion(
	{ S }: Sim,
	n: FieldNode,
	E: NodeEls,
	dt: number,
	act: (number | undefined)[],
): void {
	const busy = act[n.id] === 1;
	if (n.expDir) {
		if (!busy) n.expU = Math.min(1, n.expU + dt / 2.2);
	} else n.expU = Math.max(0, n.expU - dt / 1.8);
	const ex = n.expU > 0 ? easeInOut(n.expU) : 0;
	if (ex <= 0.0005) {
		if (E.expOn) {
			show(E.r1, "visible");
			show(E.r2, "visible");
			show(E.xa, "hidden");
			show(E.xb, "hidden");
			show(E.xc, "hidden");
			E.expOn = false;
		}
		return;
	}
	const L = S.nodes[n.host] as FieldNode;
	const lx = L.x - n.x;
	const ly = L.y - n.y;
	const dx = n.x - L.x;
	const dy = n.y - L.y;
	const d0 = Math.hypot(dx, dy) || 1;
	const a = Math.atan2(dy, dx);
	const sh = expShape(n, L, d0);
	const d = lerp(d0, sh.dFull, ex);
	const k = lerp(1, sh.sc, ex);
	const target = Math.min(n.feas, 2.0 * n.R);
	n.lenCur += (target - n.lenCur) * (1 - Math.exp(-dt * (target < n.lenCur ? 5 : 1.6)));
	const len = ex * n.lenCur;
	const h = 2 * Math.asin(clamp(len / (2 * d), 0, 1));
	if (!E.xa || !E.xb || !E.xc) {
		const v = Math.max(0, n.vis);
		const at = {
			fill: "none",
			"stroke-linecap": "round",
			"stroke-linejoin": "round",
			stroke: mix("ring", v),
			"stroke-width": 2,
			opacity: 0.79,
		};
		const groups = n.ng;
		if (!groups) return;
		E.xa = el("path", at, groups.r);
		E.xb = el("path", at, groups.r);
		E.xc = el(
			"path",
			{
				fill: "none",
				stroke: COL.pitch,
				"stroke-width": 1,
				"stroke-dasharray": "16 6 2 6",
				"stroke-linecap": "round",
			},
			groups.c,
		);
	}
	show(E.r1, "hidden");
	show(E.r2, "hidden");
	show(E.xa, "visible");
	show(E.xb, "visible");
	show(E.xc, "visible");
	E.boss.setAttribute("d", kidneyPath(lx, ly, d, n.R * k, a - h, a + h));
	E.xa.setAttribute("d", kidneyPath(lx, ly, d, n.ro * k, a - h, a + h));
	E.xb.setAttribute("d", kidneyPath(lx, ly, d, n.ri * k, a - h, a + h));
	const sp = h + ((n.R * 0.55) / d) * ex + 0.05;
	E.xc.setAttribute(
		"d",
		`M${n2(lx + Math.cos(a - sp) * d)} ${n2(ly + Math.sin(a - sp) * d)}A${n2(d)} ${n2(d)} 0 ${sp > Math.PI / 2 ? 1 : 0} 1 ${n2(lx + Math.cos(a + sp) * d)} ${n2(ly + Math.sin(a + sp) * d)}`,
	);
	E.xc.setAttribute("opacity", (0.65 * ex).toFixed(3));
	E.expOn = true;
}
