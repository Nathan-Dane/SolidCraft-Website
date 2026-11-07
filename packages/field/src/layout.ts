/*
 * Building the field's nodes and webs for a page: which nodes there are, how big, where they are placed around the hero, which
 * of them become the satellites, and which pairs are joined.
 */
import { DEG, MASTER, segSegIntersect, TAU } from "./geometry.ts";
import { clamp, distSeg } from "./math.ts";
import type {
	Anchor,
	FieldEdge,
	FieldNode,
	Layout,
	LayoutState,
	Rect,
	SizeClass,
} from "./types.ts";

type Rand = () => number;

/** A node as the layout receives it: a master node, or an anchor the page added. */
type Def = {
	id: number;
	x: number;
	y: number;
	R: number;
	ro: number;
	ri: number;
	style: FieldNode["style"];
	pitch?: number | undefined;
	hole?: number | undefined;
	n?: number | undefined;
	a0?: number | undefined;
	cap?: number | undefined;
	fixed?: boolean | undefined;
	kind?: FieldNode["kind"] | undefined;
	partner?: number | undefined;
	pillLeft?: boolean | undefined;
};

const SMALL_SCALE = [0.46, 0.6, 0.72, 0.54];

export function buildNodes(S: LayoutState, layout: Layout, rand: Rand): void {
	const anchors: Anchor[] = layout.anchors;
	const defs: Def[] = [
		...MASTER.nodes,
		...anchors.map((a, i): Def => ({ ...a, id: MASTER.nodes.length + i })),
	];
	S.rects = layout.rects;
	// on the hero page the field's nodes get planned size classes by rank: 4 very large, 2 large, 5 medium and 4 small
	// (the small ones are scaled down; every dimension of a node scales with it)
	const ranked = defs.filter((d) => !d.fixed).sort((p, q) => q.R - p.R);
	const classOf = new Map<number, SizeClass>();
	const scaleOf = new Map<number, number>();
	ranked.forEach((d, k) => {
		const cls: SizeClass = k < 4 ? "xl" : k < 6 ? "l" : k < ranked.length - 4 ? "m" : "s";
		classOf.set(d.id, cls);
		if (cls === "s") scaleOf.set(d.id, SMALL_SCALE[k - (ranked.length - 4)] as number);
		else if (cls === "m")
			scaleOf.set(d.id, 0.8); // medium well below large
		else if (cls === "xl") scaleOf.set(d.id, 1.3); // very large: bigger, and four of them
	});
	S.nodes = defs.map((def): FieldNode => {
		let m = def;
		const cls: SizeClass = m.fixed ? "" : (classOf.get(m.id) ?? "");
		const shrink = scaleOf.get(m.id);
		if (cls && shrink) {
			m = { ...m, R: m.R * shrink, ro: m.ro * shrink, ri: m.ri * shrink };
			if (m.pitch) m.pitch *= shrink;
			if (m.hole) m.hole *= shrink;
			if (m.cap) m.cap *= shrink;
		}
		const small = m.R < 130 ? 1.35 : 1;
		const A = m.fixed ? 0 : (50 + 0.12 * m.R) * small;
		const n: FieldNode = {
			id: m.id,
			hx: m.x,
			hy: m.y,
			x: m.x,
			y: m.y,
			R: m.R,
			ro: m.ro,
			ri: m.ri,
			style: m.style,
			pitch: m.pitch,
			hole: m.hole,
			nh: m.n,
			a0: (m.a0 || 0) * DEG,
			cap: m.cap || 8,
			ax: A * (0.8 + 0.4 * rand()),
			ay: A * (0.8 + 0.4 * rand()),
			wx1: TAU / (56 + rand() * 38),
			wx2: TAU / (22 + rand() * 20),
			wy1: TAU / (62 + rand() * 40),
			wy2: TAU / (25 + rand() * 20),
			px1: rand() * TAU,
			px2: rand() * TAU,
			py1: rand() * TAU,
			py2: rand() * TAU,
			ox: 0,
			oy: 0,
			qx: 0,
			qy: 0,
			qvx: 0,
			qvy: 0,
			ptx: 0,
			pty: 0,
			ang: 0,
			vel: 0,
			tgt: 0,
			next: 4 + rand() * 9,
			kick: 0,
			breathe: rand() * TAU,
			pulse: 0,
			hot: 0,
			vis: -1,
			kx: 0,
			ky: 0,
			kvx: 0,
			kvy: 0,
			expU: 0,
			expDir: 0,
			host: -1,
			expNext: 22 + rand() * 30,
			expUntil: 0,
			lenCur: 0,
			feas: 0,
			chainSpin: 0,
			cls,
			fixed: !!m.fixed,
			kind: m.kind || "field",
			partner: m.partner === undefined ? -1 : m.partner,
			pillLeft: !!m.pillLeft,
			extraHot: 0,
			els: null,
			step: 0,
		};
		n.step =
			m.kind === "cap"
				? 0
				: n.style === "holes"
					? TAU / (n.nh ?? 1)
					: n.style === "kidney"
						? TAU / 3
						: Math.PI / 6;
		return n;
	});
}

function nodeAt(S: LayoutState, i: number): FieldNode {
	return S.nodes[i] as FieldNode;
}

/** Does a segment cross any of the text rectangles? */
export function segHitsRects(
	S: LayoutState,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): boolean {
	for (const r of S.rects) {
		let t0 = 0;
		let t1 = 1;
		const dx = x1 - x0;
		const dy = y1 - y0;
		const p = [-dx, dx, -dy, dy];
		const qv = [x0 - r[0], r[2] - x0, y0 - r[1], r[3] - y0];
		let hit = true;
		for (let k = 0; k < 4; k++) {
			const pk = p[k] as number;
			const qk = qv[k] as number;
			if (pk === 0) {
				if (qk < 0) {
					hit = false;
					break;
				}
			} else {
				const t = qk / pk;
				if (pk < 0) {
					if (t > t1) {
						hit = false;
						break;
					}
					if (t > t0) t0 = t;
				} else {
					if (t < t0) {
						hit = false;
						break;
					}
					if (t < t1) t1 = t;
				}
			}
		}
		if (hit) return true;
	}
	return false;
}

type SatSearch = { best: (FieldNode | null)[] | null; cost: number; missing: number };

/**
 * The best assignment of field nodes to the satellite target points: nodes of a suitable size, fully inside the view, nearest to
 * their targets (every combination is tried; a target may go without a node).
 */
export function satSearch(S: LayoutState, layout: Layout): SatSearch {
	const targets = layout.satTargets;
	const V = layout.view;
	const cand = S.nodes.filter((n) => {
		const m = n.R * 0.85 + 20;
		return (
			!n.fixed &&
			n.R >= 92 &&
			n.R <= 200 &&
			n.hx > V.x + m &&
			n.hx < V.x + V.w - m &&
			n.hy > V.y + Math.max(m, 0.17 * V.h) &&
			n.hy < V.y + V.h - m
		);
	});
	let best: (FieldNode | null)[] | null = null;
	let bestCost = 1e12;
	const search = (k: number, chosen: (FieldNode | null)[], cost: number): void => {
		if (cost >= bestCost) return;
		if (k === targets.length) {
			bestCost = cost;
			best = chosen.slice();
			return;
		}
		const target = targets[k] as Layout["satTargets"][number];
		for (const n of cand) {
			if (chosen.includes(n)) continue;
			chosen.push(n);
			search(k + 1, chosen, cost + Math.hypot(n.hx - target.x, n.hy - target.y));
			chosen.pop();
		}
		chosen.push(null); // a target may go without a node when none is suitable
		search(k + 1, chosen, cost + 700);
		chosen.pop();
	};
	search(0, [], 0);
	const found = best as (FieldNode | null)[] | null;
	let missing = 0;
	for (const n of found ?? []) if (!n) missing++;
	return { best: found, cost: bestCost, missing };
}

/** Webs between neighbours: closest pairs first, no crossings, nothing in the way, at most four per node. */
export function proximityBonds(S: LayoutState): [number, number][] {
	const ns = S.nodes;
	const pairs: { i: number; j: number; gap: number }[] = [];
	for (let i = 0; i < ns.length; i++) {
		for (let j = i + 1; j < ns.length; j++) {
			const a = nodeAt(S, i);
			const b = nodeAt(S, j);
			if ((a.fixed && b.fixed) || a.kind === "cap" || b.kind === "cap") continue;
			const gap = Math.hypot(a.hx - b.hx, a.hy - b.hy) - a.R - b.R;
			if (gap < 520) pairs.push({ i, j, gap });
		}
	}
	pairs.sort((p, q) => p.gap - q.gap);
	const out: [number, number][] = [];
	const deg = new Map<number, number>();
	const degOf = (k: number) => deg.get(k) ?? 0;
	for (const p of pairs) {
		const a = nodeAt(S, p.i);
		const b = nodeAt(S, p.j);
		const limit = degOf(p.i) === 0 || degOf(p.j) === 0 ? 520 : 330;
		if (p.gap > limit || degOf(p.i) >= 4 || degOf(p.j) >= 4) continue;
		if (segHitsRects(S, a.hx, a.hy, b.hx, b.hy)) continue;
		let blocked = false;
		for (let k = 0; k < ns.length; k++) {
			if (k === p.i || k === p.j) continue;
			const nk = nodeAt(S, k);
			if (distSeg(nk.hx, nk.hy, a.hx, a.hy, b.hx, b.hy) < nk.R + 16) {
				blocked = true;
				break;
			}
		}
		if (blocked) continue;
		for (const o of out) {
			if (o[0] === p.i || o[0] === p.j || o[1] === p.i || o[1] === p.j) continue;
			const oa = nodeAt(S, o[0]);
			const ob = nodeAt(S, o[1]);
			if (segSegIntersect(a.hx, a.hy, b.hx, b.hy, oa.hx, oa.hy, ob.hx, ob.hy)) {
				blocked = true;
				break;
			}
		}
		if (blocked) continue;
		out.push([p.i, p.j]);
		deg.set(p.i, degOf(p.i) + 1);
		deg.set(p.j, degOf(p.j) + 1);
	}
	return out;
}

/**
 * The field is laid out afresh around the hero by planned placement. Each size class is placed in turn, every node at the best
 * of many random candidates for its class:
 *   very large  spread far apart, toward the edges (cropped, as in the master)
 *   large       one right beside a very large node, the other well away from them
 *   medium      drawn toward denser regions, never crowded, and out of the middle band of the view
 *   small       into the largest voids
 * The best of several whole attempts (fewest empty areas, balanced halves, all satellites placeable) is kept.
 */
export function layoutHome(S: LayoutState, layout: Layout, rand: Rand): void {
	const ns = S.nodes;
	const fixedN = ns.filter((n) => n.fixed);
	const V = layout.view;
	const cx = V.x + V.w / 2;
	const field = ns.filter((n) => !n.fixed).sort((p, q) => q.R - p.R);
	const byCls = (c: SizeClass) => field.filter((n) => n.cls === c);
	const rectGap = (x: number, y: number, R: number): number => {
		let g = Number.POSITIVE_INFINITY;
		for (const r of S.rects as Rect[]) {
			g = Math.min(g, Math.hypot(x - clamp(x, r[0], r[2]), y - clamp(y, r[1], r[3])) - R);
		}
		return g;
	};
	const nearestGap = (x: number, y: number, R: number, set: FieldNode[]): number => {
		let g = Number.POSITIVE_INFINITY;
		for (const o of set) g = Math.min(g, Math.hypot(x - o.hx, y - o.hy) - R - o.R);
		return g;
	};
	// empty space left over the visible area outside the hero, plus any imbalance between the halves
	const voidCost = (): number => {
		let cost = 0;
		let cnt = 0;
		let imbalance = 0;
		for (const n of field) imbalance += n.hx < cx ? 1 : -1;
		for (let gx = 0; gx < 22; gx++) {
			for (let gy = 0; gy < 13; gy++) {
				const x = V.x + ((gx + 0.5) / 22) * V.w;
				const y = V.y + ((gy + 0.5) / 13) * V.h;
				if (rectGap(x, y, 0) < 30) continue;
				const d = nearestGap(x, y, 0, ns);
				if (d < 0) continue;
				cost += Math.max(0, d - 130) ** 2;
				cnt++;
			}
		}
		return cost / Math.max(1, cnt) + 900 * Math.abs(imbalance);
	};
	const attempt = (): void => {
		const placed: FieldNode[] = [];
		let left = 0;
		let right = 0;
		const place = (
			n: FieldNode,
			margin: number,
			score: (x: number, y: number, g: number, gP: number) => number,
		): void => {
			let best = Number.NEGATIVE_INFINITY;
			for (let c = 0; c < 220; c++) {
				const x = V.x - margin * n.R + rand() * (V.w + 2 * margin * n.R);
				const y = V.y - margin * n.R + rand() * (V.h + 2 * margin * n.R);
				const gF = nearestGap(x, y, n.R, fixedN);
				const gP = nearestGap(x, y, n.R, placed);
				if (rectGap(x, y, n.R) < 50 || gF < 120 || gP < 70) continue;
				let sc = score(x, y, Math.min(gF, gP), gP);
				if (x < cx ? left < right : right < left) sc += 20; // balance the two halves
				if (sc > best) {
					best = sc;
					n.hx = x;
					n.hy = y;
				}
			}
			placed.push(n);
			if (n.hx < cx) left++;
			else right++;
		};
		const xl = byCls("xl");
		for (const n of xl) {
			place(n, 0.2, (x, y) => {
				const edge = Math.min(x - V.x, V.x + V.w - x, y - V.y, V.y + V.h - y);
				let far = Number.POSITIVE_INFINITY;
				for (const o of placed) far = Math.min(far, Math.hypot(x - o.hx, y - o.hy));
				return Math.min(far, 900) * 0.25 - Math.max(0, edge) * 0.2;
			});
		}
		byCls("l").forEach((n, k) => {
			place(n, 0.1, (x, y, _g, gP) =>
				k === 0 ? -Math.abs(gP - 80) * 2 : Math.min(nearestGap(x, y, n.R, xl), 420) * 0.5,
			);
		});
		for (const n of byCls("m")) {
			place(n, 0.2, (x, y, g) => {
				let dens = 0;
				for (const o of placed) {
					dens += Math.exp(-Math.max(0, Math.hypot(x - o.hx, y - o.hy) - n.R - o.R) / 190);
				}
				const band =
					n.R > 95 ? 60 * Math.max(0, 1 - Math.abs(y - (V.y + V.h * 0.52)) / (V.h * 0.2)) : 0;
				return dens * 55 - Math.max(0, g - 200) * 0.3 - band;
			});
		}
		for (const n of byCls("s")) {
			place(n, 0.15, (_x, _y, g) => Math.min(g, 330));
		}
	};
	let bestCost = Number.POSITIVE_INFINITY;
	let bestPos: [number, number][] = [];
	for (let tries = 0; tries < 28; tries++) {
		attempt();
		const sat = satSearch(S, layout);
		const cost = voidCost() + sat.missing * 4000 + sat.cost * 0.6;
		if (cost < bestCost) {
			bestCost = cost;
			bestPos = field.map((n): [number, number] => [n.hx, n.hy]);
		}
	}
	field.forEach((n, k) => {
		const p = bestPos[k] as [number, number];
		n.hx = n.x = p[0];
		n.hy = n.y = p[1];
	});
	for (const n of fixedN) {
		n.x = n.hx;
		n.y = n.hy;
	}
	S.autoBonds = proximityBonds(S);
}

/**
 * Four of the (already relaxed) field nodes become the satellites: the nearest well-sized node to each target point. They stay
 * ordinary field nodes (they drift and take part in webs); the page attaches labels to them.
 */
export function assignSatellites(S: LayoutState, layout: Layout): void {
	const targets = layout.satTargets;
	S.satIds = {};
	S.bonds = [];
	if (!targets.length) return;
	const best = satSearch(S, layout).best;
	(best ?? []).forEach((n, k) => {
		if (!n) return;
		n.kind = "sat";
		n.ro = 0.66 * n.R;
		n.ri = 0;
		if (n.R >= 150) {
			// the larger satellites carry orbiting details (a bolt circle or a ring of slots that index)
			const kid = k % 2 === 1;
			n.style = kid ? "kidney" : "holes";
			n.pitch = 0.83 * n.R;
			n.hole = 0.05 * n.R;
			n.nh = 4;
			n.a0 = 25 * DEG;
			n.cap = 0.045 * n.R;
			n.step = kid ? TAU / 3 : TAU / 4;
		} else {
			n.style = "plain";
			n.step = Math.PI / 6;
		}
		n.ax *= 0.5; // satellites stay close to where they were placed
		n.ay *= 0.5;
		S.satIds[(targets[k] as Layout["satTargets"][number]).key] = n.id;
	});
	for (const b of layout.bondSpec) {
		const sid = S.satIds[b[0]];
		if (sid === undefined) continue;
		const s = nodeAt(S, sid);
		const c = nodeAt(S, b[1]);
		if (
			Math.hypot(s.hx - c.hx, s.hy - c.hy) - s.R - c.R < 420 &&
			!segHitsRects(S, s.hx, s.hy, c.hx, c.hy)
		) {
			S.bonds.push([sid, b[1]]);
		}
	}
	// every button must be able to send a pulse: a button's outer cap with no satellite web is bonded to the nearest field
	// node out to its side instead
	for (const b of layout.bondSpec) {
		const capId = b[1];
		if (S.bonds.some((x) => x[1] === capId)) continue;
		const c = nodeAt(S, capId);
		const p = nodeAt(S, c.partner);
		const out = Math.atan2(c.hy - p.hy, c.hx - p.hx); // outward direction of this cap
		let bestN: FieldNode | null = null;
		let bd = 1e9;
		for (const n of S.nodes) {
			if (n.fixed) continue;
			const ang = Math.atan2(n.hy - c.hy, n.hx - c.hx);
			const da = Math.abs(((ang - out + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
			if (da > 1.0) continue; // within about 57 degrees of straight out
			const gap = Math.hypot(n.hx - c.hx, n.hy - c.hy) - n.R - c.R;
			if (gap < 60 || gap > 520 || segHitsRects(S, n.hx, n.hy, c.hx, c.hy)) continue;
			if (gap < bd) {
				bd = gap;
				bestN = n;
			}
		}
		if (bestN) S.bonds.push([(bestN as FieldNode).id, capId]);
	}
}

function mkEdge(
	i: number,
	j: number,
	ed: { type: "A" | "S"; rf: number; slot: [number, number] | null },
	bonded: boolean,
): FieldEdge {
	return {
		i,
		j,
		ed: { type: ed.type, rf: ed.rf, slot: ed.slot, bonded },
		u: bonded ? 1 : 0,
		dir: bonded ? 1 : 0,
		c: bonded ? 1 : 0,
		near: false,
		onC: 0,
		offC: 0,
		g: null,
		els: null,
		pulseP: -1,
		pulseDir: 1,
		prevU: bonded ? 1 : 0,
		glow: 0,
		glowOn: false,
		lastProbe: -99,
		blocked: false,
	};
}

type BaseEdge = {
	i: number;
	j: number;
	type: "A" | "S";
	rf: number;
	slot: [number, number] | null;
};

export function buildEdges(S: LayoutState): void {
	S.edges = [];
	const key = new Set<string>();
	const base: BaseEdge[] = S.autoBonds
		? S.autoBonds.map((p): BaseEdge => {
				const minR = Math.min(nodeAt(S, p[0]).R, nodeAt(S, p[1]).R);
				return {
					i: p[0],
					j: p[1],
					type: (p[0] * 7 + p[1] * 13) % 3 === 0 ? "S" : "A",
					rf: 0.45 * minR,
					slot: (p[0] + p[1]) % 2 === 0 ? [Math.min(0.045 * minR, 7), 61] : null,
				};
			})
		: MASTER.edges;
	for (const e of base) {
		key.add(`${e.i}-${e.j}`);
		key.add(`${e.j}-${e.i}`);
		S.edges.push(mkEdge(e.i, e.j, e, true));
	}
	// webs the layout asks for (e.g. a satellite joined to a button): bonded, so they always try to exist
	for (const b of S.bonds) {
		key.add(`${b[0]}-${b[1]}`);
		key.add(`${b[1]}-${b[0]}`);
		const minR = Math.min(nodeAt(S, b[0]).R, nodeAt(S, b[1]).R);
		S.edges.push(mkEdge(b[0], b[1], { type: "A", rf: 0.45 * minR, slot: null }, true));
	}
	for (let i = 0; i < S.nodes.length; i++) {
		for (let j = i + 1; j < S.nodes.length; j++) {
			if (key.has(`${i}-${j}`)) continue;
			const a = nodeAt(S, i);
			const b = nodeAt(S, j);
			if (a.fixed && b.fixed) continue;
			const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.R - b.R;
			if (gap > (a.fixed || b.fixed ? 800 : 480)) continue;
			const minR = Math.min(a.R, b.R);
			const type = (i * 7 + j * 13) % 3 === 0 ? "S" : "A";
			S.edges.push(
				mkEdge(
					i,
					j,
					{
						type,
						rf: 0.45 * minR,
						slot: (i + j) % 2 === 0 ? [Math.min(0.045 * minR, 7), 61] : null,
					},
					false,
				),
			);
		}
	}
}
