/** Paths as the renderer reads them: lines and circular arcs (M, L, H, V, A and Z, the only commands the field produces). */
import { TAU } from "./geometry.ts";

export type Line = { t: 0; x0: number; y0: number; x1: number; y1: number; len: number };
export type ArcSeg = {
	t: 1;
	cx: number;
	cy: number;
	r: number;
	a0: number;
	sweep: number;
	len: number;
};
export type Seg = Line | ArcSeg;
export type Sub = { segs: Seg[]; pts: number[]; closed: boolean };
export type ParsedPath = { subs: Sub[]; len: number };

type ArcCentre = { cx: number; cy: number; r: number; a0: number; sweep: number };

export function arcCenter(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	rIn: number,
	large: number,
	sweep: number,
): ArcCentre | null {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const c = Math.hypot(dx, dy);
	if (c < 1e-9) return null;
	const r = rIn < c / 2 ? c / 2 : rIn;
	const h = Math.sqrt(Math.max(0, r * r - (c * c) / 4));
	const mx = (x0 + x1) / 2;
	const my = (y0 + y1) / 2;
	const px = -dy / c;
	const py = dx / c;
	for (let sg = -1; sg <= 1; sg += 2) {
		const cx = mx + px * h * sg;
		const cy = my + py * h * sg;
		const t0 = Math.atan2(y0 - cy, x0 - cx);
		const t1 = Math.atan2(y1 - cy, x1 - cx);
		let d: number;
		if (sweep) {
			d = t1 - t0;
			while (d < 0) d += TAU;
		} else {
			d = t0 - t1;
			while (d < 0) d += TAU;
			d = -d;
		}
		if (h < 1e-6) return { cx, cy, r, a0: t0, sweep: sweep ? Math.PI : -Math.PI };
		if (Math.abs(d) > Math.PI + 1e-9 === !!large) return { cx, cy, r, a0: t0, sweep: d };
	}
	return null;
}

/** A small scanner: no regular expressions and no temporary arrays, as it runs for every changed path of every frame. */
export function parsePath(d: string): ParsedPath {
	const subs: Sub[] = [];
	let cur: Sub | null = null;
	let x = 0;
	let y = 0;
	let total = 0;
	let i = 0;
	const N = d.length;

	function line(c: Sub, x1: number, y1: number): void {
		const L = Math.hypot(x1 - x, y1 - y);
		if (L > 1e-9) {
			c.segs.push({ t: 0, x0: x, y0: y, x1, y1, len: L });
			total += L;
		}
		c.pts.push(x1, y1);
		x = x1;
		y = y1;
	}

	function num(): number {
		while (i < N) {
			const ch = d.charCodeAt(i);
			if (ch === 32 || ch === 44) i++;
			else break;
		}
		const st = i;
		const ch2 = d.charCodeAt(i);
		if (ch2 === 45 || ch2 === 43) i++;
		while (i < N) {
			const q = d.charCodeAt(i);
			if ((q >= 48 && q <= 57) || q === 46) i++;
			else if ((q === 101 || q === 69) && i > st) {
				i++;
				const q2 = d.charCodeAt(i);
				if (q2 === 45 || q2 === 43) i++;
			} else break;
		}
		return +d.substring(st, i);
	}

	while (i < N) {
		const c = d.charCodeAt(i++);
		if (c === 77) {
			// M
			const mx = num();
			const my = num();
			cur = { segs: [], pts: [mx, my], closed: false };
			subs.push(cur);
			x = mx;
			y = my;
		} else if (!cur) {
		} else if (c === 76) {
			const lx = num();
			const ly = num();
			line(cur, lx, ly);
		} else if (c === 72) line(cur, num(), y);
		else if (c === 86) line(cur, x, num());
		else if (c === 65) {
			// A rx ry rot large sweep x y
			const rx = num();
			num();
			num();
			const lg = num();
			const sw = num();
			const ex = num();
			const ey = num();
			const ac = arcCenter(x, y, ex, ey, rx, lg, sw);
			if (ac) {
				const L2 = Math.abs(ac.sweep) * ac.r;
				cur.segs.push({ t: 1, cx: ac.cx, cy: ac.cy, r: ac.r, a0: ac.a0, sweep: ac.sweep, len: L2 });
				total += L2;
			}
			cur.pts.push(ex, ey);
			x = ex;
			y = ey;
		} else if (c === 90) {
			// Z
			const first = cur.pts;
			if (Math.hypot((first[0] as number) - x, (first[1] as number) - y) > 1e-6) {
				line(cur, first[0] as number, first[1] as number);
			}
			cur.closed = true;
		}
	}
	return { subs, len: total };
}
