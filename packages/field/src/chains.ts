/** Chain loops: a belt wrapped round two or three nodes. */

import { el } from "./build-dom.ts";
import { n2, segSegIntersect, TAU } from "./geometry.ts";
import { clamp, distSeg, easeInOut, smooth } from "./math.ts";
import { COL } from "./palette.ts";
import { inView, type Sim } from "./sim.ts";
import type { FieldNode } from "./types.ts";

type Hull = { d: string; pts: number[] };

/** The belt's outline around the nodes `ids`, offset `off` from their bosses, or null when they are not one convex group. */
export function hullOf({ S }: Sim, ids: number[], off: number): Hull | null {
	const C = ids.map((i) => S.nodes[i] as FieldNode);
	const m = C.length;
	const r = C.map((n) => n.R + off);
	const N = 180;
	const idx: number[] = [];
	const sup = (th: number, i: number): number => {
		const c = C[i] as FieldNode;
		return c.x * Math.cos(th) + c.y * Math.sin(th) + (r[i] as number);
	};
	for (let k = 0; k < N; k++) {
		const th = (TAU * k) / N;
		let bi = 0;
		let bv = -1e18;
		for (let i = 0; i < m; i++) {
			const v = sup(th, i);
			if (v > bv) {
				bv = v;
				bi = i;
			}
		}
		idx.push(bi);
	}
	let s0 = -1;
	for (let k = 0; k < N; k++) {
		if (idx[k] !== idx[(k + N - 1) % N]) {
			s0 = k;
			break;
		}
	}
	if (s0 < 0) return null;
	const runs: { i: number; k: number; a0: number }[] = [];
	for (let k = 0; k < N; k++) {
		const kk = (s0 + k) % N;
		const last = runs[runs.length - 1];
		if (!last || last.i !== idx[kk]) runs.push({ i: idx[kk] as number, k: kk, a0: 0 });
	}
	if (runs.length !== m) return null;
	for (let q = 0; q < runs.length; q++) {
		const run = runs[q] as (typeof runs)[number];
		const pr = (runs[(q + runs.length - 1) % runs.length] as (typeof runs)[number]).i;
		let lo = (TAU * (run.k - 1)) / N;
		let hi = (TAU * run.k) / N;
		for (let it = 0; it < 22; it++) {
			const mid = (lo + hi) / 2;
			if (sup(mid, pr) - sup(mid, run.i) > 0) lo = mid;
			else hi = mid;
		}
		run.a0 = (lo + hi) / 2;
	}
	let d = "";
	const pts: number[] = [];
	for (let q = 0; q < runs.length; q++) {
		const run = runs[q] as (typeof runs)[number];
		const a0 = run.a0;
		let a1 = (runs[(q + 1) % runs.length] as (typeof runs)[number]).a0;
		while (a1 <= a0) a1 += TAU;
		const c = C[run.i] as FieldNode;
		const rr = r[run.i] as number;
		d += `${q === 0 ? "M" : "L"}${n2(c.x + Math.cos(a0) * rr)} ${n2(c.y + Math.sin(a0) * rr)}A${n2(rr)} ${n2(rr)} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${n2(c.x + Math.cos(a1) * rr)} ${n2(c.y + Math.sin(a1) * rr)}`;
		const steps = Math.max(2, Math.ceil((a1 - a0) / 0.1));
		for (let j = 0; j <= steps; j++) {
			const aa = a0 + ((a1 - a0) * j) / steps;
			pts.push(c.x + Math.cos(aa) * rr, c.y + Math.sin(aa) * rr);
		}
	}
	return { d: `${d}Z`, pts };
}

function pointInPoly(x: number, y: number, pts: number[]): boolean {
	let inside = false;
	for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
		const yi = pts[i + 1] as number;
		const yj = pts[j + 1] as number;
		const xi = pts[i] as number;
		const xj = pts[j] as number;
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

function chainValid(sim: Sim, ids: number[], relaxed: boolean): Hull | null {
	const { S } = sim;
	const ns = S.nodes;
	for (const id of ids) {
		const n = ns[id] as FieldNode;
		if (n.expDir || n.expU > 0 || n.fixed || n.kind === "sat") return null;
	}
	const h = hullOf(sim, ids, 14);
	if (!h) return null;
	const pts = h.pts;
	for (const rc of S.rects) {
		for (let rp = 0; rp < pts.length; rp += 2) {
			const px = pts[rp] as number;
			const py = pts[rp + 1] as number;
			if (px > rc[0] && px < rc[2] && py > rc[1] && py < rc[3]) return null;
		}
	}
	const clr = relaxed ? 8 : 20;
	for (let k = 0; k < ns.length; k++) {
		if (ids.includes(k)) continue;
		const c = ns[k] as FieldNode;
		if (pointInPoly(c.x, c.y, pts)) return null;
		for (let p = 0; p < pts.length - 2; p += 2) {
			if (
				distSeg(
					c.x,
					c.y,
					pts[p] as number,
					pts[p + 1] as number,
					pts[p + 2] as number,
					pts[p + 3] as number,
				) <
				c.R + clr
			) {
				return null;
			}
		}
	}
	let cross = 0;
	for (const e of S.edges) {
		if (e.u < 0.5) continue;
		const inA = ids.includes(e.i);
		const inB = ids.includes(e.j);
		if (inA && inB) continue;
		const A = ns[e.i] as FieldNode;
		const B = ns[e.j] as FieldNode;
		let hit = 0;
		for (let s = 0; s < pts.length - 2; s += 2) {
			if (
				segSegIntersect(
					A.x,
					A.y,
					B.x,
					B.y,
					pts[s] as number,
					pts[s + 1] as number,
					pts[s + 2] as number,
					pts[s + 3] as number,
				)
			) {
				hit++;
			}
		}
		if (hit && !inA && !inB) return null;
		cross += hit;
	}
	if (cross > 3) return null;
	let cx = 0;
	let cy = 0;
	for (const i of ids) {
		const n = ns[i] as FieldNode;
		cx += n.x / ids.length;
		cy += n.y / ids.length;
	}
	if (!inView(S, cx, cy, 0)) return null;
	return h;
}

/** Retire belts whose conditions went bad or whose time is up, and now and then wrap a new one. */
export function manageChains(sim: Sim): void {
	const { S, rand, GR } = sim;
	for (const c of S.chains) {
		if (c.dir < 0) continue;
		if (S.t - c.born > c.life || !chainValid(sim, c.ids, true)) c.dir = -1;
	}
	if (S.chains.length >= 2 || S.t < S.nextChain || rand() > 0.15) return;
	const used = new Set<number>();
	for (const c of S.chains) for (const i of c.ids) used.add(i);
	const free = (ids: number[]) => !ids.some((i) => used.has(i));
	const pairs: number[][] = [];
	const triples: number[][] = [];
	for (const e of S.edges) {
		if (e.u < 0.97) continue;
		const ids = [e.i, e.j];
		if (free(ids) && chainValid(sim, ids, false)) pairs.push(ids);
		for (const f of S.edges) {
			if (f === e || f.u < 0.97) continue;
			const k = f.i === e.i || f.i === e.j ? f.j : f.j === e.i || f.j === e.j ? f.i : -1;
			if (k < 0 || k === e.i || k === e.j) continue;
			const tri = [e.i, e.j, k];
			if (triples.some((t) => t.slice().sort().join() === tri.slice().sort().join())) continue;
			if (free(tri) && chainValid(sim, tri, false)) triples.push(tri);
		}
	}
	const pool = triples.length && (rand() < 0.5 || !pairs.length) ? triples : pairs;
	if (!pool.length) {
		S.nextChain = S.t + 2;
		return;
	}
	const ids = pool[Math.floor(rand() * pool.length)] as number[];
	const g = el("g", { "data-chain": "" }, GR["concentric-bearing-families"]);
	S.chains.push({
		ids,
		u: 0,
		dir: 1,
		born: S.t,
		life: 14 + rand() * 12,
		phase: 0,
		g,
		links: el(
			"path",
			{
				fill: "none",
				stroke: COL.ring,
				"stroke-width": 5,
				"stroke-dasharray": "11 5",
				"stroke-linejoin": "round",
			},
			g,
		),
		pin: el(
			"path",
			{ fill: "none", stroke: COL.ring, "stroke-width": 1, "stroke-linejoin": "round" },
			g,
		),
	});
}

export function updateChains(sim: Sim, dt: number): void {
	const { S, rand } = sim;
	const keep: typeof S.chains = [];
	for (const c of S.chains) {
		c.u = clamp(c.u + (c.dir > 0 ? dt / 2.2 : -dt / 1.6), 0, 1);
		if (c.dir < 0 && c.u <= 0) {
			c.g.remove();
			S.nextChain = S.t + 3 + rand() * 6;
			continue;
		}
		keep.push(c);
		const e = easeInOut(c.u);
		const h = hullOf(sim, c.ids, 14 + 46 * (1 - e));
		if (!h) {
			c.dir = -1;
			c.g.setAttribute("opacity", 0);
			continue;
		}
		c.phase += 24 * e * dt;
		c.links.setAttribute("d", h.d);
		c.pin.setAttribute("d", h.d);
		c.links.setAttribute("stroke-dashoffset", (-c.phase).toFixed(2));
		c.links.setAttribute("opacity", (0.28 * smooth(c.u * 1.5)).toFixed(3));
		c.pin.setAttribute("opacity", (0.3 * smooth(c.u * 1.5)).toFixed(3));
		c.g.setAttribute("opacity", 1);
	}
	S.chains = keep;
}
