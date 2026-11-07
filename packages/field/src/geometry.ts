/*
 * Pure geometry for the connected-geometry field: the master layout and the analytic rules that join bosses into continuous
 * profiles, so the field can rebuild the same drawing at any set of node positions. No DOM here.
 *
 *   - every node is a boss circle (R) with concentric rings (ro, ri);
 *   - a web joining two bosses has a neck half-width w = 0.09 * min(Ri, Rj);
 *   - "arc" webs: each side is ONE circle of radius Rb, externally tangent to both bosses, whose nearest approach to the centre
 *     line is w;
 *   - "straight" webs: each side is a line at offset w, joined to the bosses by two fillet arcs (radius rf) tangent to the line
 *     and to the boss;
 *   - the boss sector between the two contact points is removed so the outline flows through the junction;
 *   - 4 units = 1 mm.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const MM = 0.25;

export type Style = "plain" | "holes" | "kidney";

export type MasterNode = {
	id: number;
	x: number;
	y: number;
	R: number;
	ro: number;
	ri: number;
	style: Style;
	pitch?: number;
	hole?: number;
	n?: number;
	a0?: number;
	cap?: number;
	a1?: number;
	a2?: number;
};

export type EdgeType = "A" | "S";

export type EdgeDef = {
	k: number;
	i: number;
	j: number;
	type: EdgeType;
	rf: number;
	/** [half width, half length of the straight core] */
	slot: [number, number] | null;
	bonded: boolean;
};

type Extras = {
	pitch?: number;
	hole?: number;
	n?: number;
	a0?: number;
	cap?: number;
	a1?: number;
	a2?: number;
};

// x, y, R (boss), ro, ri (rings), style, extras
const NODE_DATA: [number, number, number, number, number, Style, Extras?][] = [
	[-96, 300, 156, 96, 52, "plain"],
	[400, 172, 112, 68, 40, "plain"],
	[784, 472, 180, 112, 60, "holes", { pitch: 144, hole: 9.9, n: 4, a0: 25 }],
	[1240, 180, 108, 68, 36, "plain"],
	[1712, 440, 144, 88, 48, "plain"],
	[2180, 180, 208, 128, 72, "kidney", { pitch: 168, cap: 8, a1: 1, a2: 29 }],
	[2672, 416, 156, 96, 52, "plain"],
	[2480, 1072, 128, 80, 44, "plain"],
	[1960, 1232, 224, 140, 76, "holes", { pitch: 180, hole: 12.32, n: 4, a0: 25 }],
	[1512, 936, 180, 112, 60, "kidney", { pitch: 144, cap: 8, a1: 1, a2: 29 }],
	[1000, 1220, 144, 88, 48, "plain"],
	[528, 956, 116, 72, 40, "plain"],
	[40, 1192, 224, 140, 76, "holes", { pitch: 180, hole: 12.32, n: 4, a0: 25 }],
	[1160, 740, 88, 56, 28, "plain"],
	[2160, 720, 108, 68, 36, "plain"],
];

// i, j, type (A = single-arc blend, S = straight span with fillets), rf (S), slot [half width, core half length]
const EDGE_DATA: [number, number, EdgeType, number, [number, number] | null][] = [
	[0, 1, "S", 50.4, null],
	[1, 2, "A", 0, [5.04, 55.87182151274086]],
	[2, 3, "S", 48.6, null],
	[3, 4, "A", 0, [4.86, 62.49911222692889]],
	[4, 5, "A", 0, null],
	[5, 6, "S", 56.16, [7.02, 61.18923691113983]],
	[6, 7, "A", 0, null],
	[7, 8, "A", 0, null],
	[8, 9, "A", 0, [7.5, 59.61929677819934]],
	[9, 10, "S", 64.8, null],
	[10, 11, "A", 0, [5.22, 62.38177512462228]],
	[11, 12, "S", 52.2, null],
	[12, 0, "A", 0, null],
	[2, 11, "A", 0, null],
	[4, 9, "A", 0, [6.48, 60.370579653433076]],
	[2, 13, "A", 0, null],
	[13, 9, "S", 39.6, null],
	[5, 14, "S", 48.6, [4.86, 62.68628043053148]],
	[14, 8, "A", 0, null],
];

export const MASTER = {
	W: 2560,
	H: 1440,
	MM,
	nodes: NODE_DATA.map(
		([x, y, R, ro, ri, style, extras], id): MasterNode => ({
			id,
			x,
			y,
			R,
			ro,
			ri,
			style,
			...extras,
		}),
	),
	edges: EDGE_DATA.map(
		([i, j, type, rf, slot], k): EdgeDef => ({ k, i, j, type, rf, slot, bonded: true }),
	),
};

/** What the rules need of a node: a centre and a boss radius. */
export type Disc = { x: number; y: number; R: number };

export type Point = { x: number; y: number };

export function wrap(a: number): number {
	const r = a % TAU;
	return r < 0 ? r + TAU : r;
}

export function angDist(a: number, b: number): number {
	const d = Math.abs(wrap(a) - wrap(b));
	return d > Math.PI ? TAU - d : d;
}

/** Neck half-width of a web between two bosses. */
export function neck(a: Disc, b: Disc): number {
	return 0.09 * Math.min(a.R, b.R);
}

type NeckResult = { s: number; fp: number; w: number };

/** Neck half-width of an externally tangent blend circle of radius Rb. */
function blendNeck(d: number, Ri: number, Rj: number, Rb: number): NeckResult {
	const s = (d * d - Rj * Rj + Ri * Ri - 2 * Rb * (Rj - Ri)) / (2 * d);
	const q = (Ri + Rb) * (Ri + Rb) - s * s;
	if (q < 0) return { s, fp: Number.NaN, w: Number.NEGATIVE_INFINITY };
	const fp = Math.sqrt(q);
	return { s, fp, w: fp - Rb };
}

export type Blend = { Rb: number; sx: number; fp: number };

export function solveBlend(
	d: number,
	Ri: number,
	Rj: number,
	w: number,
	RbMax?: number,
): Blend | null {
	const gap = d - Ri - Rj;
	if (gap <= 1) return null;
	let lo = gap / 2 + 1e-6;
	let hi = RbMax || 900;
	if (blendNeck(d, Ri, Rj, hi).w < w) return null;
	for (let k = 0; k < 34; k++) {
		const mid = (lo + hi) / 2;
		if (blendNeck(d, Ri, Rj, mid).w < w) lo = mid;
		else hi = mid;
	}
	const Rb = (lo + hi) / 2;
	const r = blendNeck(d, Ri, Rj, Rb);
	return { Rb, sx: r.s, fp: r.fp };
}

export type Straight = { rf: number; sa: number; sb: number; len: number };

export function solveStraight(
	d: number,
	Ri: number,
	Rj: number,
	h: number,
	rfPref: number,
	minLen: number,
): Straight | null {
	function ends(rf: number): { sa: number; sb: number; len: number } | null {
		const a = (Ri + rf) * (Ri + rf) - (h + rf) * (h + rf);
		const b = (Rj + rf) * (Rj + rf) - (h + rf) * (h + rf);
		if (a <= 0 || b <= 0) return null;
		const sa = Math.sqrt(a);
		const sb = Math.sqrt(b);
		return { sa, sb, len: d - sa - sb };
	}
	let rf = rfPref;
	let e = ends(rf);
	if (!e) return null;
	if (e.len < minLen) {
		let lo = 4;
		let hi = rf;
		const eLo = ends(lo);
		if (!eLo || eLo.len < minLen) return null;
		for (let k = 0; k < 28; k++) {
			const mid = (lo + hi) / 2;
			const em = ends(mid);
			if (em && em.len >= minLen) lo = mid;
			else hi = mid;
		}
		rf = lo;
		e = ends(rf);
		if (!e) return null;
	}
	return { rf, sa: e.sa, sb: e.sb, len: e.len };
}

export type EdgeGeom = {
	d: number;
	gap: number;
	w: number;
	type: EdgeType;
	ux: number;
	uy: number;
	nx: number;
	ny: number;
	ang: number;
	Rb?: number;
	sx?: number;
	fp?: number;
	rf?: number;
	sa?: number;
	sb?: number;
	len?: number;
	thA: number;
	thB: number;
};

export type EdgeOptions = { RbMax?: number; minLen?: number };

/** Everything needed to draw one web, or null when the pair cannot be joined. */
export function edgeGeom(
	a: Disc,
	b: Disc,
	ed: { type: EdgeType; rf: number },
	opt: EdgeOptions = {},
): EdgeGeom | null {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const d = Math.hypot(dx, dy);
	if (d < 1) return null;
	const Ri = a.R;
	const Rj = b.R;
	const gap = d - Ri - Rj;
	if (gap < 4) return null;
	const w = neck(a, b);
	const base = {
		d,
		gap,
		w,
		type: ed.type,
		ux: dx / d,
		uy: dy / d,
		nx: -dy / d,
		ny: dx / d,
		ang: Math.atan2(dy, dx),
	};
	if (ed.type === "A") {
		const r = solveBlend(d, Ri, Rj, w, opt.RbMax || 640);
		if (!r) return null;
		return {
			...base,
			Rb: r.Rb,
			sx: r.sx,
			fp: r.fp,
			thA: Math.atan2(r.fp, r.sx),
			thB: Math.atan2(r.fp, d - r.sx),
		};
	}
	const s = solveStraight(d, Ri, Rj, w, ed.rf, opt.minLen || 56);
	if (!s) return null;
	return {
		...base,
		rf: s.rf,
		sa: s.sa,
		sb: s.sb,
		len: s.len,
		thA: Math.atan2(w + s.rf, s.sa),
		thB: Math.atan2(w + s.rf, s.sb),
	};
}

function cross(ax: number, ay: number, bx: number, by: number): number {
	return ax * by - ay * bx;
}

export type Arc = {
	cx: number;
	cy: number;
	r: number;
	x1: number;
	y1: number;
	x2: number;
	y2: number;
	sweep: 0 | 1;
};

export type Line = { x1: number; y1: number; x2: number; y2: number };

export type Outline = { arcs: Arc[]; line: Line | null; Ta: Point | null; Tb: Point | null };

/**
 * One side (+1 / -1) of a web outline as exact primitives: arcs and, for straight webs, one line. Ta and Tb are the contact
 * points on the two bosses.
 */
export function outline(a: Disc, b: Disc, g: EdgeGeom, side: 1 | -1): Outline {
	const { ux, uy } = g;
	const nx = g.nx * side;
	const ny = g.ny * side;
	const out: Outline = { arcs: [], line: null, Ta: null, Tb: null };
	if (g.type === "A") {
		const { Rb = 0, sx = 0, fp = 0 } = g;
		const fx = a.x + ux * sx + nx * fp;
		const fy = a.y + uy * sx + ny * fp;
		const ka = a.R / (a.R + Rb);
		const kb = b.R / (b.R + Rb);
		const Ta = { x: a.x + (fx - a.x) * ka, y: a.y + (fy - a.y) * ka };
		const Tb = { x: b.x + (fx - b.x) * kb, y: b.y + (fy - b.y) * kb };
		const sw = cross(Ta.x - fx, Ta.y - fy, Tb.x - fx, Tb.y - fy) > 0 ? 1 : 0;
		out.arcs.push({ cx: fx, cy: fy, r: Rb, x1: Ta.x, y1: Ta.y, x2: Tb.x, y2: Tb.y, sweep: sw });
		out.Ta = Ta;
		out.Tb = Tb;
		return out;
	}
	const { rf = 0, sa = 0, sb = 0 } = g;
	const hf = g.w + rf;
	const fax = a.x + ux * sa + nx * hf;
	const fay = a.y + uy * sa + ny * hf;
	const fbx = b.x - ux * sb + nx * hf;
	const fby = b.y - uy * sb + ny * hf;
	const pax = a.x + ux * sa + nx * g.w;
	const pay = a.y + uy * sa + ny * g.w;
	const pbx = b.x - ux * sb + nx * g.w;
	const pby = b.y - uy * sb + ny * g.w;
	const ta = a.R / (a.R + rf);
	const tb = b.R / (b.R + rf);
	const TA = { x: a.x + (fax - a.x) * ta, y: a.y + (fay - a.y) * ta };
	const TB = { x: b.x + (fbx - b.x) * tb, y: b.y + (fby - b.y) * tb };
	const s1 = cross(TA.x - fax, TA.y - fay, pax - fax, pay - fay) > 0 ? 1 : 0;
	const s2 = cross(pbx - fbx, pby - fby, TB.x - fbx, TB.y - fby) > 0 ? 1 : 0;
	out.arcs.push({ cx: fax, cy: fay, r: rf, x1: TA.x, y1: TA.y, x2: pax, y2: pay, sweep: s1 });
	out.line = { x1: pax, y1: pay, x2: pbx, y2: pby };
	out.arcs.push({ cx: fbx, cy: fby, r: rf, x1: pbx, y1: pby, x2: TB.x, y2: TB.y, sweep: s2 });
	out.Ta = TA;
	out.Tb = TB;
	return out;
}

/** Axial half-width of the material between two bosses at axial position x (from a). */
export function materialHalfWidth(a: Disc, b: Disc, g: EdgeGeom, x: number): number {
	const d = g.d;
	const wBoss = Math.max(
		x < a.R ? Math.sqrt(Math.max(0, a.R * a.R - x * x)) : 0,
		d - x < b.R ? Math.sqrt(Math.max(0, b.R * b.R - (d - x) * (d - x))) : 0,
	);
	let web = 0;
	if (g.type === "A") {
		const { Rb = 0, sx = 0, fp = 0 } = g;
		const dxs = x - sx;
		if (Math.abs(dxs) < Rb) web = fp - Math.sqrt(Rb * Rb - dxs * dxs);
	} else {
		const { rf = 0, sa = 0, sb = 0 } = g;
		if (x >= sa && x <= d - sb) {
			web = g.w;
		} else if (x < sa) {
			const q = x - sa;
			if (Math.abs(q) < rf) web = g.w + rf - Math.sqrt(rf * rf - q * q);
		} else {
			const q2 = x - (d - sb);
			if (Math.abs(q2) < rf) web = g.w + rf - Math.sqrt(rf * rf - q2 * q2);
		}
	}
	return Math.max(wBoss, web);
}

export type Slot = { hw: number; a: number; t: number; max: number };

/** Slot (stadium) inside a web, centred half-way between the two centres. */
export function slotFor(
	a: Disc,
	b: Disc,
	g: EdgeGeom,
	ed: { slot: [number, number] | null },
	shift?: number,
): Slot | null {
	if (!ed.slot) return null;
	const hw = Math.min(ed.slot[0], g.w * 0.5, 7.5);
	const want = ed.slot[1];
	const t = g.d / 2 + (shift || 0);
	const wall = 3.2;
	let total = want + hw;
	// shrink until both ends sit inside material with a wall
	for (let k = 0; k < 60; k++) {
		const ok =
			materialHalfWidth(a, b, g, t - total) >= hw + wall &&
			materialHalfWidth(a, b, g, t + total) >= hw + wall;
		if (ok) break;
		total -= 1.2;
	}
	const core = total - hw;
	if (core < 4) return null;
	return { hw, a: core, t, max: want };
}

/** A number rounded to two decimals, for path strings. */
export function n2(v: number): number {
	return Math.round(v * 100) / 100;
}

export function slotPath(a: Disc, g: EdgeGeom, s: Slot, grow: number): string {
	const core = s.a * grow;
	if (core < 0.4) return "";
	const { ux, uy } = g;
	const nx = g.nx * s.hw;
	const ny = g.ny * s.hw;
	const mx = a.x + ux * s.t;
	const my = a.y + uy * s.t;
	const x1 = mx - ux * core;
	const y1 = my - uy * core;
	const x2 = mx + ux * core;
	const y2 = my + uy * core;
	const r = s.hw;
	return (
		`M${n2(x1 + nx)} ${n2(y1 + ny)}` +
		`L${n2(x2 + nx)} ${n2(y2 + ny)}` +
		`A${n2(r)} ${n2(r)} 0 0 0 ${n2(x2 - nx)} ${n2(y2 - ny)}` +
		`L${n2(x1 - nx)} ${n2(y1 - ny)}` +
		`A${n2(r)} ${n2(r)} 0 0 0 ${n2(x1 + nx)} ${n2(y1 + ny)}Z`
	);
}

/** Path of one outline side: M Ta A.. [L Pb A..] Tb. */
export function outlineD(o: Outline): string {
	const A = o.arcs[0];
	if (!A) return "";
	let s = `M${n2(A.x1)} ${n2(A.y1)}`;
	s += `A${n2(A.r)} ${n2(A.r)} 0 0 ${A.sweep} ${n2(A.x2)} ${n2(A.y2)}`;
	if (o.line) {
		s += `L${n2(o.line.x2)} ${n2(o.line.y2)}`;
		const B = o.arcs[1];
		if (B) s += `A${n2(B.r)} ${n2(B.r)} 0 0 ${B.sweep} ${n2(B.x2)} ${n2(B.y2)}`;
	}
	return s;
}

/** An opening in a boss circle: its angle and half-width. */
export type Opening = { a: number; w: number };

/** Boss circle with openings removed. */
export function bossPath(n: Disc, open: Opening[]): string {
	const R = n.R;
	if (!open.length) {
		return (
			`M${n2(n.x + R)} ${n2(n.y)}` +
			`A${R} ${R} 0 1 1 ${n2(n.x - R)} ${n2(n.y)}` +
			`A${R} ${R} 0 1 1 ${n2(n.x + R)} ${n2(n.y)}`
		);
	}
	const op = open.slice().sort((p, q) => wrap(p.a) - wrap(q.a));
	let d = "";
	for (let k = 0; k < op.length; k++) {
		const cur = op[k] as Opening;
		const nxt = op[(k + 1) % op.length] as Opening;
		const a1 = wrap(cur.a) + cur.w;
		const a2 = wrap(nxt.a) - nxt.w + (k === op.length - 1 ? TAU : 0);
		let span = a2 - a1;
		if (op.length === 1) span = TAU - 2 * cur.w;
		if (span <= 0.0004) continue;
		const x1 = n.x + Math.cos(a1) * R;
		const y1 = n.y + Math.sin(a1) * R;
		const x2 = n.x + Math.cos(a2) * R;
		const y2 = n.y + Math.sin(a2) * R;
		d += `M${n2(x1)} ${n2(y1)}A${R} ${R} 0 ${span > Math.PI ? 1 : 0} 1 ${n2(x2)} ${n2(y2)}`;
	}
	return d;
}

export function kidneyPath(
	cx: number,
	cy: number,
	pitch: number,
	cap: number,
	a1: number,
	a2: number,
): string {
	const ro = pitch + cap;
	const ri = pitch - cap;
	const c1 = Math.cos(a1);
	const s1 = Math.sin(a1);
	const c2 = Math.cos(a2);
	const s2 = Math.sin(a2);
	const large = a2 - a1 > Math.PI ? 1 : 0;
	return (
		`M${n2(cx + ro * c1)} ${n2(cy + ro * s1)}` +
		`A${ro} ${ro} 0 ${large} 1 ${n2(cx + ro * c2)} ${n2(cy + ro * s2)}` +
		`A${cap} ${cap} 0 0 1 ${n2(cx + ri * c2)} ${n2(cy + ri * s2)}` +
		`A${ri} ${ri} 0 ${large} 0 ${n2(cx + ri * c1)} ${n2(cy + ri * s1)}` +
		`A${cap} ${cap} 0 0 1 ${n2(cx + ro * c1)} ${n2(cy + ro * s1)}Z`
	);
}

/** Sampled points of one outline side (for clearance tests), appended to `out` as x, y pairs. */
export function samplePoints(o: Outline, out: number[], perArc = 5): void {
	for (const A of o.arcs) {
		const a1 = Math.atan2(A.y1 - A.cy, A.x1 - A.cx);
		const a2 = Math.atan2(A.y2 - A.cy, A.x2 - A.cx);
		let da = a2 - a1;
		if (A.sweep) {
			while (da < 0) da += TAU;
		} else {
			while (da > 0) da -= TAU;
		}
		for (let k = 0; k <= perArc; k++) {
			const t = a1 + (da * k) / perArc;
			out.push(A.cx + Math.cos(t) * A.r, A.cy + Math.sin(t) * A.r);
		}
	}
	if (o.line) {
		for (let m = 1; m < 4; m++) {
			out.push(
				o.line.x1 + ((o.line.x2 - o.line.x1) * m) / 4,
				o.line.y1 + ((o.line.y2 - o.line.y1) * m) / 4,
			);
		}
	}
}

export function segSegIntersect(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	cx: number,
	cy: number,
	dx: number,
	dy: number,
): boolean {
	const d1 = cross(bx - ax, by - ay, cx - ax, cy - ay);
	const d2 = cross(bx - ax, by - ay, dx - ax, dy - ay);
	const d3 = cross(dx - cx, dy - cy, ax - cx, ay - cy);
	const d4 = cross(dx - cx, dy - cy, bx - cx, by - cy);
	return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Exact checks on a built web: how far the contacts are from tangent. */
export function verifyOutline(
	a: Disc,
	b: Disc,
	_g: EdgeGeom,
	o: Outline,
): { sin: number; line: number } {
	function radialAt(A: Arc, node: Disc, T: Point): number {
		// blend circle radius vector vs. boss radius vector at the contact: collinear
		const v1x = (T.x - A.cx) / A.r;
		const v1y = (T.y - A.cy) / A.r;
		const v2x = (T.x - node.x) / node.R;
		const v2y = (T.y - node.y) / node.R;
		return Math.abs(cross(v1x, v1y, v2x, v2y));
	}
	const first = o.arcs[0];
	const last = o.arcs[o.arcs.length - 1];
	if (!first || !last) return { sin: 0, line: 0 };
	let maxSin = 0;
	let maxLine = 0;
	maxSin = Math.max(maxSin, radialAt(first, a, { x: first.x1, y: first.y1 }));
	maxSin = Math.max(maxSin, radialAt(last, b, { x: last.x2, y: last.y2 }));
	if (o.line) {
		const lx = o.line.x2 - o.line.x1;
		const ly = o.line.y2 - o.line.y1;
		const L = Math.hypot(lx, ly);
		const A0 = o.arcs[0] as Arc;
		const A1 = o.arcs[1] as Arc;
		const r0x = (o.line.x1 - A0.cx) / A0.r;
		const r0y = (o.line.y1 - A0.cy) / A0.r;
		const r1x = (o.line.x2 - A1.cx) / A1.r;
		const r1y = (o.line.y2 - A1.cy) / A1.r;
		maxLine = Math.max(Math.abs((lx * r0x + ly * r0y) / L), Math.abs((lx * r1x + ly * r1y) / L));
	}
	return { sin: maxSin, line: maxLine };
}
