/** Dimension labels, read off the live geometry; they appear and retire by rule. */
import { el } from "./build-dom.ts";
import { DEG, MM, n2, outline, TAU, wrap } from "./geometry.ts";
import { ADVANCE } from "./glyphs.ts";
import { clamp, distSeg, easeOut, smooth } from "./math.ts";
import { COL } from "./palette.ts";
import { glyphId } from "./scene.ts";
import {
	inView,
	type Label,
	type LabelGeo,
	type LabelKind,
	type LabelSpec,
	type LabelText,
	type Sim,
} from "./sim.ts";
import type { FieldEdge, FieldNode } from "./types.ts";

const CHAR_W = ADVANCE * 0.018; // 10.8 units per character at label scale

function textObj(parent: Label["g"]): LabelText {
	const g = el("g", { fill: COL.dim, opacity: 0 }, parent);
	return { g, str: "", n: 0, uses: [] };
}

function setText(t: LabelText, str: string): void {
	if (t.str === str) return;
	t.str = str;
	t.g.clear();
	t.uses = [];
	const n = str.length;
	for (let i = 0; i < n; i++) {
		t.uses.push(el("use", { href: `#${glyphId(str.charAt(i))}`, x: (i - n / 2) * ADVANCE }, t.g));
	}
	t.n = n;
}

/** An arrow head with its tip at (tx, ty); the shaft direction (dx, dy) is a unit vector pointing away from the tip. */
function arrow(tx: number, ty: number, dx: number, dy: number, len: number, hw: number): string {
	const bx = tx + dx * len;
	const by = ty + dy * len;
	return `M${n2(tx)} ${n2(ty)}L${n2(bx - dy * hw)} ${n2(by + dx * hw)}L${n2(bx + dy * hw)} ${n2(by - dx * hw)}Z`;
}

function textPts(cx: number, cy: number, w: number): number[] {
	return [cx - w / 2 - 4, cy - 12, cx + w / 2 + 4, cy + 6];
}

function mmStr(v: number, dec: number): string {
	return v.toFixed(dec);
}

/** What a label of a kind is made of: the lines, arrows and text, or null when it cannot be drawn now. */
type Builder = (sim: Sim, L: LabelSpec) => LabelGeo | null;

const KIND: Record<LabelKind, Builder> = {
	bore: ({ S }, L) => {
		const n = S.nodes[L.a as number] as FieldNode;
		if (n.expU > 0.02) return null;
		const th = (n.id % 2 ? -30 : 30) * DEG;
		const c = Math.cos(th);
		const s = Math.sin(th);
		const ro = n.ri;
		const rin = n.ri * 0.56;
		const lines =
			`M${n2(n.x + c * ro)} ${n2(n.y + s * ro)}L${n2(n.x + c * rin)} ${n2(n.y + s * rin)}` +
			`M${n2(n.x - c * ro)} ${n2(n.y - s * ro)}L${n2(n.x - c * rin)} ${n2(n.y - s * rin)}`;
		const arrows =
			arrow(n.x + c * ro, n.y + s * ro, -c, -s, 6.2, 2) +
			arrow(n.x - c * ro, n.y - s * ro, c, s, 6.2, 2);
		const str = `Ø${mmStr(n.ri * 2 * MM, 0)}`;
		const tx = n.x + 9 * s;
		const ty = n.y - 9 * c;
		const w = str.length * CHAR_W;
		return {
			lines,
			arrows,
			text: { x: tx, y: ty, rot: th / DEG, str, op: 0.78 },
			pts: [n.x - n.ri, n.y - n.ri, n.x + n.ri, n.y + n.ri],
			tpts: [tx - w / 2, ty - w / 2, tx + w / 2, ty + w / 2],
			cx: n.x,
			cy: n.y,
		};
	},
	span: ({ S }, L) => {
		const e = S.edges[L.e as number] as FieldEdge;
		if (e.u < 0.9 || !e.g) return null;
		let A = S.nodes[e.i] as FieldNode;
		let B = S.nodes[e.j] as FieldNode;
		if (A.x > B.x) {
			const t0 = A;
			A = B;
			B = t0;
		}
		const dx = B.x - A.x;
		if (dx < 150) return null;
		const yc = L.dirY as number;
		const maxR = Math.max(A.R, B.R);
		const yd = yc > 0 ? Math.max(A.y, B.y) + 0.6 * maxR : Math.min(A.y, B.y) - 0.72 * maxR;
		const sg = yc > 0 ? 1 : -1;
		const str = mmStr(dx * MM, 0);
		const tw = str.length * CHAR_W;
		const xm = (A.x + B.x) / 2;
		const gap = tw / 2 + 6;
		const lines =
			`M${n2(A.x)} ${n2(A.y)}L${n2(A.x)} ${n2(yd + sg * 8)}` +
			`M${n2(B.x)} ${n2(B.y)}L${n2(B.x)} ${n2(yd + sg * 8)}` +
			`M${n2(A.x)} ${n2(yd)}L${n2(xm - gap)} ${n2(yd)}` +
			`M${n2(xm + gap)} ${n2(yd)}L${n2(B.x)} ${n2(yd)}`;
		const arrows = arrow(A.x, yd, 1, 0, 6.2, 2) + arrow(B.x, yd, -1, 0, 6.2, 2);
		return {
			lines,
			arrows,
			text: { x: xm, y: yd - 6, rot: 0, str, op: 0.75 },
			pts: [A.x, Math.min(A.y, yd), B.x, Math.max(A.y, yd, B.y)],
			tpts: textPts(xm, yd - 6, tw),
			cx: xm,
			cy: yd,
			seg: [A.x, yd, B.x, yd],
		};
	},
	radius: ({ S }, L) => {
		const e = S.edges[L.e as number] as FieldEdge;
		if (e.u < 0.9 || !e.g || e.g.type !== "A") return null;
		const a = S.nodes[e.i] as FieldNode;
		const b = S.nodes[e.j] as FieldNode;
		const o = outline(a, b, e.g, (L.side as 1 | -1) ?? 1);
		const A = o.arcs[0];
		if (!A) return null;
		const a1 = Math.atan2(A.y1 - A.cy, A.x1 - A.cx);
		const a2 = Math.atan2(A.y2 - A.cy, A.x2 - A.cx);
		let da = a2 - a1;
		if (A.sweep) {
			while (da < 0) da += TAU;
		} else {
			while (da > 0) da -= TAU;
		}
		const am = a1 + da * 0.5 + (L.shift as number) * (da > 0 ? 1 : -1) * 0.18;
		const px = A.cx + Math.cos(am) * A.r;
		const py = A.cy + Math.sin(am) * A.r;
		const vx = -Math.cos(am);
		const vy = -Math.sin(am);
		const ld = clamp(A.r * 0.36, 46, 96);
		const ex = px + vx * ld;
		const ey = py + vy * ld;
		const str = `R${mmStr(A.r * MM, 1)}`;
		const tw = str.length * CHAR_W;
		const sg = vx >= 0 ? 1 : -1;
		const sx = ex + sg * (tw + 10);
		const lines = `M${n2(px)} ${n2(py)}L${n2(ex)} ${n2(ey)}L${n2(sx)} ${n2(ey)}`;
		const arrows = arrow(px, py, vx, vy, 6.2, 2);
		const tcx = ex + sg * (5 + tw / 2);
		return {
			lines,
			arrows,
			text: { x: tcx, y: ey - 4, rot: 0, str, op: 0.72 },
			pts: [px, py, sx, ey],
			tpts: textPts(tcx, ey - 4, tw),
			cx: ex,
			cy: ey,
		};
	},
	length: ({ S }, L) => {
		const e = S.edges[L.e as number] as FieldEdge;
		if (e.u < 0.9 || !e.g || e.g.type !== "S") return null;
		const a = S.nodes[e.i] as FieldNode;
		const b = S.nodes[e.j] as FieldNode;
		const g = e.g;
		const side = (L.side as 1 | -1) ?? 1;
		const o = outline(a, b, g, side);
		if (!o.line) return null;
		const P1 = { x: o.line.x1, y: o.line.y1 };
		const P2 = { x: o.line.x2, y: o.line.y2 };
		const nxo = g.nx * side;
		const nyo = g.ny * side;
		const od = 38;
		const q1 = { x: P1.x + nxo * od, y: P1.y + nyo * od };
		const q2 = { x: P2.x + nxo * od, y: P2.y + nyo * od };
		const len = Math.hypot(P2.x - P1.x, P2.y - P1.y);
		const str = mmStr(len * MM, 1);
		const tw = str.length * CHAR_W;
		const mx = (q1.x + q2.x) / 2;
		const my = (q1.y + q2.y) / 2;
		let phi = g.ang;
		if (phi > Math.PI / 2) phi -= Math.PI;
		if (phi < -Math.PI / 2) phi += Math.PI;
		const ux = Math.cos(phi);
		const uy = Math.sin(phi);
		const gap = tw / 2 + 6;
		const lines =
			`M${n2(P1.x + nxo * 6)} ${n2(P1.y + nyo * 6)}L${n2(q1.x + nxo * 8)} ${n2(q1.y + nyo * 8)}` +
			`M${n2(P2.x + nxo * 6)} ${n2(P2.y + nyo * 6)}L${n2(q2.x + nxo * 8)} ${n2(q2.y + nyo * 8)}` +
			`M${n2(q1.x)} ${n2(q1.y)}L${n2(mx - ux * gap)} ${n2(my - uy * gap)}` +
			`M${n2(mx + ux * gap)} ${n2(my + uy * gap)}L${n2(q2.x)} ${n2(q2.y)}`;
		const du = Math.cos(g.ang);
		const dv = Math.sin(g.ang);
		const arrows = arrow(q1.x, q1.y, du, dv, 6.2, 2) + arrow(q2.x, q2.y, -du, -dv, 6.2, 2);
		// text sits on the outer side of the dimension line
		let tsx = Math.sin(phi) * 6;
		let tsy = -Math.cos(phi) * 6;
		if (tsx * nxo + tsy * nyo < 0) {
			tsx = -tsx;
			tsy = -tsy;
		}
		const tx = mx + tsx * 1;
		const ty = my + tsy * 1;
		return {
			lines,
			arrows,
			text: { x: tx - 0, y: ty, rot: phi / DEG, str, op: 0.75, flip: tsx * nxo + tsy * nyo },
			pts: [P1.x, P1.y, P2.x, P2.y, q1.x, q1.y, q2.x, q2.y],
			tpts: textPts(mx, my, Math.max(tw, 30)),
			cx: mx,
			cy: my,
		};
	},
	angle: ({ S }, L) => {
		const n = S.nodes[L.a as number] as FieldNode;
		const arr: { a: number; e: FieldEdge }[] = [];
		for (const e of S.edges) {
			if (e.u < 0.9 || !e.g) continue;
			if (e.i === n.id) arr.push({ a: e.g.ang, e });
			else if (e.j === n.id) arr.push({ a: wrap(e.g.ang + Math.PI), e });
		}
		const pa = arr.find((x) => x.e === S.edges[L.e1 as number]);
		const pb = arr.find((x) => x.e === S.edges[L.e2 as number]);
		if (!pa || !pb) return null;
		let a1 = pa.a;
		let a2 = pb.a;
		let d = (((a2 - a1) % TAU) + TAU) % TAU;
		if (d > Math.PI) {
			const tmp = a1;
			a1 = a2;
			a2 = tmp;
			d = TAU - d;
		}
		if (d < 35 * DEG || d > 165 * DEG) return null;
		const r = n.R * 0.7;
		const c1 = Math.cos(a1);
		const s1 = Math.sin(a1);
		const c2 = Math.cos(a2);
		const s2 = Math.sin(a2);
		const lines =
			`M${n2(n.x + c1 * (r - 22))} ${n2(n.y + s1 * (r - 22))}L${n2(n.x + c1 * (r + 18))} ${n2(n.y + s1 * (r + 18))}` +
			`M${n2(n.x + c2 * (r - 22))} ${n2(n.y + s2 * (r - 22))}L${n2(n.x + c2 * (r + 18))} ${n2(n.y + s2 * (r + 18))}` +
			`M${n2(n.x + c1 * r)} ${n2(n.y + s1 * r)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(n.x + c2 * r)} ${n2(n.y + s2 * r)}`;
		const bis = a1 + d / 2;
		const str = `${mmStr(d / DEG, 1)}°`;
		const tw = str.length * CHAR_W;
		const tx = n.x + Math.cos(bis) * (r + 26);
		const ty = n.y + Math.sin(bis) * (r + 26) + 4;
		return {
			lines,
			arrows: "",
			text: { x: tx, y: ty, rot: 0, str, op: 0.75 },
			pts: [n.x - r - 20, n.y - r - 20, n.x + r + 20, n.y + r + 20],
			tpts: textPts(tx, ty, tw),
			cx: n.x,
			cy: n.y,
		};
	},
};

function makeLabel(sim: Sim, kind: LabelKind, spec: LabelSpec): Label {
	const { S, rand, GR, seen } = sim;
	const g = el("g", { "data-kind": kind, "data-label": "" }, GR["related-dimensions"]);
	const L: Label = {
		kind,
		g,
		prog: 0,
		dir: 1,
		born: S.t,
		life: 9 + rand() * 7,
		bad: 0,
		lines: el(
			"path",
			{
				fill: "none",
				stroke: COL.dim,
				"stroke-width": 1,
				opacity: 0.62,
				"stroke-linecap": "round",
				"stroke-linejoin": "round",
				pathLength: 1,
			},
			g,
		),
		arrows: el("path", { fill: COL.dim, opacity: 0 }, g),
		txt: textObj(g),
		lastTxt: -10,
		bbox: null,
		geo: null,
		hold: false,
		key: `${kind}:${spec.keyPart || ""}`,
		...spec,
	};
	L.hold = !!spec.hold;
	seen[L.key] = S.t;
	return L;
}

/** Grow, draw and retire the labels. */
export function labelStep(sim: Sim, dt: number): void {
	const { S } = sim;
	const out: Label[] = [];
	for (const L of S.labels) {
		const geo = KIND[L.kind](sim, L);
		L.geo = geo;
		if (!geo && L.dir > 0) L.dir = -1;
		if (L.dir > 0) {
			if (L.prog < 1) L.prog = Math.min(1, L.prog + dt / 1.1);
		} else L.prog = Math.max(0, L.prog - dt / 0.75);
		if (L.prog <= 0 && L.dir < 0) {
			L.g.remove();
			continue;
		}
		out.push(L);
		L.g.setAttribute("opacity", geo ? 1 : clamp(L.prog * 1.6, 0, 1).toFixed(3));
		if (!geo) continue;
		const p = L.prog;
		const lp = easeOut(Math.min(1, p / 0.62));
		L.lines.setAttribute("d", geo.lines);
		L.lines.setAttribute("stroke-dasharray", lp >= 0.999 ? "none" : `${lp.toFixed(4)} 2`);
		L.lines.setAttribute("visibility", lp < 0.003 ? "hidden" : "visible");
		L.arrows.setAttribute("d", geo.arrows);
		L.arrows.setAttribute("opacity", (0.55 * smooth((p - 0.35) / 0.3)).toFixed(3));
		// text: updated at ~6 Hz so the readout ticks rather than blurs
		L.flash = (L.flash || 0) * Math.exp(-dt * 3);
		if (S.t - L.lastTxt > 0.17 || L.txt.str === "") {
			if (L.txt.str !== "" && L.txt.str !== geo.text.str) L.flash = 1;
			setText(L.txt, geo.text.str);
			L.lastTxt = S.t;
		}
		const tt = geo.text;
		L.txt.g.setAttribute(
			"transform",
			`translate(${n2(tt.x)} ${n2(tt.y)}) rotate(${n2(tt.rot)}) scale(0.018 -0.018)`,
		);
		const tp = smooth((p - 0.42) / 0.5);
		L.txt.g.setAttribute("opacity", Math.min(1, tt.op * tp * (1 + 0.34 * L.flash)).toFixed(3));
		L.bbox = geo.tpts;
	}
	S.labels = out;
}

function overlapsRect(b: number[], r: number[], pad: number): boolean {
	return !(
		(b[2] as number) + pad < (r[0] as number) ||
		(b[0] as number) - pad > (r[2] as number) ||
		(b[3] as number) + pad < (r[1] as number) ||
		(b[1] as number) - pad > (r[3] as number)
	);
}

function labelEligible(
	{ S }: Sim,
	geo: LabelGeo | null,
	self: Label | null,
	strict: boolean,
): boolean {
	if (!geo) return false;
	const m = strict ? 34 : 6;
	const tp = geo.tpts as [number, number, number, number];
	if (!inView(S, tp[0], tp[1], m) || !inView(S, tp[2], tp[3], m)) return false;
	if (!inView(S, geo.cx, geo.cy, 0)) return false;
	for (const r of S.rects) if (overlapsRect(tp, r, 8)) return false;
	for (const hn of S.nodes) {
		if (
			(hn.fixed || hn.kind === "sat") &&
			overlapsRect(tp, [hn.x - hn.R, hn.y - hn.R, hn.x + hn.R, hn.y + hn.R], 10)
		)
			return false;
	}
	for (const o of S.labels) {
		if (o === self || !o.bbox) continue;
		if (overlapsRect(tp, o.bbox, strict ? 40 : 10)) return false;
		// two horizontal dimension lines should not share a baseline
		if (
			geo.seg &&
			o.geo?.seg &&
			Math.abs((geo.seg[1] as number) - (o.geo.seg[1] as number)) < 60 &&
			!(
				(geo.seg[2] as number) < (o.geo.seg[0] as number) - 20 ||
				(geo.seg[0] as number) > (o.geo.seg[2] as number) + 20
			)
		) {
			return false;
		}
	}
	return true;
}

function recent({ S, seen }: Sim, key: string): boolean {
	const at = seen[key];
	return at !== undefined && S.t - at < 12;
}

/** The dimension line should not cut through other bosses more than once. */
function spanClear({ S }: Sim, geo: LabelGeo): boolean {
	const s = geo.seg as number[];
	let hits = 0;
	for (const n of S.nodes) {
		if (
			distSeg(n.x, n.y, s[0] as number, s[1] as number, s[2] as number, s[3] as number) <
			n.R * 0.92
		)
			hits++;
	}
	return hits <= 2;
}

type Candidate = { kind: LabelKind; spec: LabelSpec; w: number };

/** Retire labels whose conditions went bad (debounced) or whose time is up, and now and then add one. */
export function labelTick(sim: Sim): void {
	const { S, rand } = sim;
	const live: Label[] = [];
	for (const L of S.labels) {
		if (L.dir < 0) continue;
		live.push(L);
		let ok = !!L.geo && labelEligible(sim, L.geo, L, false);
		if (L.hold) ok = ok || !!L.geo;
		L.bad = ok ? 0 : L.bad + 1;
		if (L.bad >= 5) L.dir = -1;
		const wait = L.kind === "bore" && S.hover === L.a ? 99 : 0;
		if (!wait && S.t - L.born > L.life) L.dir = -1;
	}
	const counts: Partial<Record<LabelKind, number>> = {};
	for (const L of live) if (L.dir > 0) counts[L.kind] = (counts[L.kind] ?? 0) + 1;
	let total = 0;
	for (const k of Object.values(counts)) total += k;
	const maxT = S.maxLabels;
	// hovering a node asks for its bore label at once
	if (S.hover >= 0) {
		const fid = S.hover;
		const have = live.some((L) => L.kind === "bore" && L.a === fid && L.dir > 0);
		if (!have) {
			const nl = makeLabel(sim, "bore", { a: fid, keyPart: fid, hold: true });
			nl.life = 5;
			S.labels.push(nl);
			return;
		}
	}
	if (S.t - S.lastSpawn < 0.85 || total >= maxT) return;
	const cands: Candidate[] = [];
	const ns = S.nodes;
	const liveKey = (key: string) => live.some((x) => x.key === key);
	// bore diameters
	if ((counts.bore ?? 0) < S.caps.bore) {
		for (const n of ns) {
			if (liveKey(`bore:${n.id}`)) continue;
			if (recent(sim, `bore:${n.id}`)) continue;
			const geo = KIND.bore(sim, { a: n.id });
			if (labelEligible(sim, geo, null, true))
				cands.push({ kind: "bore", spec: { a: n.id, keyPart: n.id }, w: 1 });
		}
	}
	S.edges.forEach((e, ei) => {
		if (e.u < 0.97 || !e.g) return;
		if ((counts.span ?? 0) < S.caps.span) {
			for (const dy of [1, -1]) {
				const geo = KIND.span(sim, { e: ei, dirY: dy });
				const key = `span:${ei}`;
				if (
					geo &&
					!liveKey(key) &&
					!recent(sim, key) &&
					labelEligible(sim, geo, null, true) &&
					spanClear(sim, geo)
				) {
					cands.push({ kind: "span", spec: { e: ei, dirY: dy, keyPart: ei }, w: 1.25 });
				}
			}
		}
		if (
			e.g.type === "A" &&
			(counts.radius ?? 0) < S.caps.radius &&
			!live.some((x) => x.kind === "radius" && x.e === ei)
		) {
			for (const sd of [1, -1]) {
				const geo = KIND.radius(sim, { e: ei, side: sd, shift: 0 });
				const key = `radius:${ei}:${sd}`;
				if (geo && !liveKey(key) && !recent(sim, key) && labelEligible(sim, geo, null, true)) {
					cands.push({
						kind: "radius",
						spec: { e: ei, side: sd, shift: 0, keyPart: `${ei}:${sd}` },
						w: 1,
					});
				}
			}
		}
		if (
			e.g.type === "S" &&
			(counts.length ?? 0) < S.caps.length &&
			!live.some((x) => x.kind === "length" && x.e === ei)
		) {
			for (const sd of [1, -1]) {
				const geo = KIND.length(sim, { e: ei, side: sd });
				const key = `length:${ei}:${sd}`;
				if (geo && !liveKey(key) && !recent(sim, key) && labelEligible(sim, geo, null, true)) {
					cands.push({ kind: "length", spec: { e: ei, side: sd, keyPart: `${ei}:${sd}` }, w: 1.1 });
				}
			}
		}
	});
	if ((counts.angle ?? 0) < S.caps.angle) {
		for (const n of ns) {
			const arr: { a: number; ei: number }[] = [];
			S.edges.forEach((e, ei) => {
				if (e.u < 0.97 || !e.g) return;
				if (e.i === n.id) arr.push({ a: e.g.ang, ei });
				else if (e.j === n.id) arr.push({ a: wrap(e.g.ang + Math.PI), ei });
			});
			if (arr.length < 2) continue;
			arr.sort((p, q) => wrap(p.a) - wrap(q.a));
			for (let i = 0; i < arr.length; i++) {
				const p = arr[i] as { a: number; ei: number };
				const q = arr[(i + 1) % arr.length] as { a: number; ei: number };
				const geo = KIND.angle(sim, { a: n.id, e1: p.ei, e2: q.ei });
				const key = `angle:${n.id}:${p.ei}:${q.ei}`;
				if (geo && !liveKey(key) && !recent(sim, key) && labelEligible(sim, geo, null, true)) {
					cands.push({
						kind: "angle",
						spec: { a: n.id, e1: p.ei, e2: q.ei, keyPart: `${n.id}:${p.ei}:${q.ei}` },
						w: 1.4,
					});
				}
			}
		}
	}
	if (!cands.length) return;
	let sum = 0;
	for (const c of cands) sum += c.w;
	let pick = rand() * sum;
	let chosen = cands[0] as Candidate;
	for (const c of cands) {
		pick -= c.w;
		if (pick <= 0) {
			chosen = c;
			break;
		}
	}
	S.labels.push(makeLabel(sim, chosen.kind, chosen.spec));
	S.lastSpawn = S.t;
}
