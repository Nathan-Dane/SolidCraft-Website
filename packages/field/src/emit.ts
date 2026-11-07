/*
 * Turning the scene into what the GPU draws. Every stroke is split into straight and circular-arc segments (all geometry in the
 * drawing is lines and arcs); each segment is one instance of a quad, and the fragment shader evaluates its exact distance.
 * Glyph labels and fills become textured triangles. No GL here: the result is two typed arrays.
 */
import { type AtlasLayout, LH, LW, LX0, LY1 } from "./atlas.ts";
import { type ParsedPath, parsePath } from "./path.ts";
import type { VEl } from "./scene.ts";

/** Floats per stroke instance. */
export const STRIDE = 24;
/** Floats per fill vertex (position, uv, premultiplied colour). */
export const FILL_STRIDE = 8;
const CHUNK_LINE = 160;
const CHUNK_ARC = Math.PI / 4;

/** [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f. */
export type Matrix = [number, number, number, number, number, number];
type Rgb = [number, number, number];

const colCache = new Map<string, Rgb>();

export function colour(s: string): Rgb {
	const hit = colCache.get(s);
	if (hit) return hit;
	let c: Rgb;
	let m: RegExpExecArray | null;
	if (s.charAt(0) === "#") {
		c = [
			Number.parseInt(s.slice(1, 3), 16) / 255,
			Number.parseInt(s.slice(3, 5), 16) / 255,
			Number.parseInt(s.slice(5, 7), 16) / 255,
		];
	} else {
		m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
		c = m ? [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255] : [1, 1, 1];
	}
	colCache.set(s, c);
	return c;
}

const dashCache = new Map<string, number[]>();

function dashArray(da: string): number[] {
	let arr = dashCache.get(da);
	if (!arr) {
		if (dashCache.size > 600) dashCache.clear();
		arr = da.split(/[\s,]+/).map(Number);
		dashCache.set(da, arr);
	}
	return arr;
}

function mul(A: Matrix, B: Matrix): Matrix {
	// A * B for [a b c d e f] affine (column-vector convention: x' = a x + c y + e)
	return [
		A[0] * B[0] + A[2] * B[1],
		A[1] * B[0] + A[3] * B[1],
		A[0] * B[2] + A[2] * B[3],
		A[1] * B[2] + A[3] * B[3],
		A[0] * B[4] + A[2] * B[5] + A[4],
		A[1] * B[4] + A[3] * B[5] + A[5],
	];
}

/** The transforms the field writes: translate, rotate (degrees) and scale, in any number, separated by spaces. */
export function applyTransform(M: Matrix, s: string): Matrix {
	let m = M;
	let i = 0;
	while (i < s.length) {
		const o = s.indexOf("(", i);
		if (o < 0) break;
		const c = s.indexOf(")", o);
		const name = s.charAt(i) === " " ? s.substring(i + 1, o) : s.substring(i, o);
		const sp = s.substring(o + 1, c).split(" ");
		const x = Number.parseFloat(sp[0] as string);
		const y = sp.length > 1 ? Number.parseFloat(sp[1] as string) : Number.NaN;
		let T: Matrix;
		if (name === "translate") T = [1, 0, 0, 1, x, Number.isNaN(y) ? 0 : y];
		else if (name === "rotate") {
			const r = (x * Math.PI) / 180;
			T = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
		} else if (name === "scale") T = [x, 0, 0, Number.isNaN(y) ? x : y, 0, 0];
		else T = [1, 0, 0, 1, 0, 0];
		m = mul(m, T);
		i = c + 1;
	}
	return m;
}

const NODASH: [number, number, number, number] = [0, 0, 0, 0];

/** What the renderer remembers of an element between frames. */
type Cached = { d?: string; gp?: ParsedPath; fake?: { k: string; d: string; gp?: ParsedPath } };

export type Emitted = { inst: Float32Array; nInst: number; fill: Float32Array; nFill: number };

export function createEmitter(atlas: AtlasLayout) {
	let inst32 = new Float32Array(STRIDE * 2048);
	let nInst = 0;
	let fill32 = new Float32Array(FILL_STRIDE * 1024);
	let nFill = 0;
	let viewScale = 1;

	function pushInst(
		g0: number,
		g1: number,
		g2: number,
		g3: number,
		b0: number,
		b1: number,
		b2: number,
		b3: number,
		type: number,
		sweep: number,
		w: number,
		alpha: number,
		rgb: Rgb,
		flags: number,
		dash: number[],
		s0: number,
		len: number,
		lim: number,
	): void {
		if ((nInst + 1) * STRIDE > inst32.length) {
			const bigger = new Float32Array(inst32.length * 2);
			bigger.set(inst32);
			inst32 = bigger;
		}
		const a = inst32;
		const k = nInst * STRIDE;
		a[k] = g0;
		a[k + 1] = g1;
		a[k + 2] = g2;
		a[k + 3] = g3;
		a[k + 4] = b0;
		a[k + 5] = b1;
		a[k + 6] = b2;
		a[k + 7] = b3;
		a[k + 8] = type;
		a[k + 9] = sweep;
		a[k + 10] = w;
		a[k + 11] = alpha;
		a[k + 12] = rgb[0];
		a[k + 13] = rgb[1];
		a[k + 14] = rgb[2];
		a[k + 15] = flags;
		a[k + 16] = dash[0] as number;
		a[k + 17] = dash[1] as number;
		a[k + 18] = dash[2] as number;
		a[k + 19] = dash[3] as number;
		a[k + 20] = s0;
		a[k + 21] = len;
		a[k + 22] = lim || 0;
		a[k + 23] = 0;
		nInst++;
	}

	function strokePath(a: VEl["a"], gp: ParsedPath, M: Matrix, alpha: number, pen: number): void {
		const sw = Number(a["stroke-width"]) || 1;
		const rgb = colour(String(a.stroke));
		const sc = Math.hypot(M[0], M[1]);
		const w = sw * sc;
		const half = w / 2 + 1.5 / viewScale;
		const round = a["stroke-linecap"] === "round";
		let dash: number[] = NODASH;
		let off = 0;
		const da = a["stroke-dasharray"];
		if (da && da !== "none") {
			const arr = dashArray(String(da));
			let f = sc;
			if (a.pathLength) f = (gp.len / (Number(a.pathLength) || 1)) * sc;
			dash = [(arr[0] as number) * f, (arr[1] || 0) * f, (arr[2] || 0) * f, (arr[3] || 0) * f];
			if (arr.length === 2 || arr.length === 1) {
				dash[2] = 0;
				dash[3] = 0;
			}
			off = (Number(a["stroke-dashoffset"]) || 0) * f;
			if (
				(dash[0] as number) + (dash[1] as number) + (dash[2] as number) + (dash[3] as number) <=
				0
			)
				dash = NODASH;
		}
		const tx = M[4];
		const ty = M[5];
		const rot = Math.atan2(M[1], M[0]);
		for (const sub of gp.subs) {
			let sCum = off;
			const ns = sub.segs.length;
			let lim = 0; // entrance: only the first `pen` of this stroke's length is drawn (the shader cuts it there)
			if (pen < 1) {
				let tl = 0;
				for (const s of sub.segs) tl += s.len * sc;
				lim = Math.max(off + pen * tl, off + 1e-3);
			}
			for (let gi = 0; gi < ns; gi++) {
				const sg = sub.segs[gi] as ParsedPath["subs"][number]["segs"][number];
				const first = gi === 0 && !sub.closed;
				const last = gi === ns - 1 && !sub.closed;
				const segLen = sg.len * sc;
				if (sg.t === 0) {
					const x0 = sg.x0 * M[0] + sg.y0 * M[2] + tx;
					const y0 = sg.x0 * M[1] + sg.y0 * M[3] + ty;
					const x1 = sg.x1 * M[0] + sg.y1 * M[2] + tx;
					const y1 = sg.x1 * M[1] + sg.y1 * M[3] + ty;
					const nc = Math.max(1, Math.ceil(segLen / CHUNK_LINE));
					for (let c = 0; c < nc; c++) {
						const t0 = c / nc;
						const t1 = (c + 1) / nc;
						const ax = x0 + (x1 - x0) * t0;
						const ay = y0 + (y1 - y0) * t0;
						const bx = x0 + (x1 - x0) * t1;
						const by = y0 + (y1 - y0) * t1;
						const fl =
							(round && first && c === 0 ? 1 : 0) +
							(round && last && c === nc - 1 ? 2 : 0) +
							(round ? 4 : 0);
						pushInst(
							ax,
							ay,
							bx,
							by,
							Math.min(ax, bx) - half,
							Math.min(ay, by) - half,
							Math.max(ax, bx) + half,
							Math.max(ay, by) + half,
							0,
							0,
							w,
							alpha,
							rgb,
							fl,
							dash,
							sCum + segLen * t0,
							segLen / nc,
							lim,
						);
					}
				} else {
					const cx = sg.cx * M[0] + sg.cy * M[2] + tx;
					const cy = sg.cx * M[1] + sg.cy * M[3] + ty;
					const r = sg.r * sc;
					const a0 = sg.a0 + rot;
					const nca = Math.max(1, Math.ceil(Math.abs(sg.sweep) / CHUNK_ARC));
					const dsw = sg.sweep / nca;
					for (let k = 0; k < nca; k++) {
						const ca0 = a0 + dsw * k;
						const fl2 =
							(round && first && k === 0 ? 1 : 0) +
							(round && last && k === nca - 1 ? 2 : 0) +
							(round ? 4 : 0);
						// bounding box of this chunk
						const e1 = ca0;
						const e2 = ca0 + dsw;
						let bx0 = Math.min(cx + Math.cos(e1) * r, cx + Math.cos(e2) * r);
						let bx1 = Math.max(cx + Math.cos(e1) * r, cx + Math.cos(e2) * r);
						let by0 = Math.min(cy + Math.sin(e1) * r, cy + Math.sin(e2) * r);
						let by1 = Math.max(cy + Math.sin(e1) * r, cy + Math.sin(e2) * r);
						const lo = Math.min(e1, e2);
						const hi = Math.max(e1, e2);
						for (let q = Math.ceil(lo / (Math.PI / 2)); q * (Math.PI / 2) <= hi; q++) {
							const qa = q * (Math.PI / 2);
							const qx = cx + Math.cos(qa) * r;
							const qy = cy + Math.sin(qa) * r;
							if (qx < bx0) bx0 = qx;
							if (qx > bx1) bx1 = qx;
							if (qy < by0) by0 = qy;
							if (qy > by1) by1 = qy;
						}
						pushInst(
							cx,
							cy,
							r,
							ca0,
							bx0 - half,
							by0 - half,
							bx1 + half,
							by1 + half,
							1,
							dsw,
							w,
							alpha,
							rgb,
							fl2,
							dash,
							sCum + (segLen / nca) * k,
							segLen / nca,
							lim,
						);
					}
				}
				sCum += segLen;
			}
		}
	}

	function pushVert(x: number, y: number, u: number, v: number, c: Rgb, a: number): void {
		if ((nFill + 1) * FILL_STRIDE > fill32.length) {
			const bigger = new Float32Array(fill32.length * 2);
			bigger.set(fill32);
			fill32 = bigger;
		}
		const k = nFill * FILL_STRIDE;
		fill32[k] = x;
		fill32[k + 1] = y;
		fill32[k + 2] = u;
		fill32[k + 3] = v;
		fill32[k + 4] = c[0] * a;
		fill32[k + 5] = c[1] * a;
		fill32[k + 6] = c[2] * a;
		fill32[k + 7] = a;
		nFill++;
	}

	function fillPath(gp: ParsedPath, M: Matrix, alpha: number, fillCol: string): void {
		const rgb = colour(fillCol);
		const [u, v] = atlas.solid;
		for (const sub of gp.subs) {
			const p = sub.pts;
			if (p.length < 6) continue;
			const wx: number[] = [];
			const wy: number[] = [];
			for (let j = 0; j < p.length; j += 2) {
				const px = p[j] as number;
				const py = p[j + 1] as number;
				wx.push(px * M[0] + py * M[2] + M[4]);
				wy.push(px * M[1] + py * M[3] + M[5]);
			}
			for (let t = 1; t < wx.length - 1; t++) {
				pushVert(wx[0] as number, wy[0] as number, u, v, rgb, alpha);
				pushVert(wx[t] as number, wy[t] as number, u, v, rgb, alpha);
				pushVert(wx[t + 1] as number, wy[t + 1] as number, u, v, rgb, alpha);
			}
		}
	}

	function glyphQuad(id: string, M: Matrix, alpha: number, fillCol: string, xoff: number): void {
		const uv = atlas.uv[id];
		if (!uv) return;
		const rgb = colour(fillCol);
		// local rect (font units), shifted by the <use> x offset, mapped through M
		const xs = [xoff + LX0, xoff + LX0 + LW] as const;
		const ys = [LY1, LY1 - LH] as const;
		const wp = (i: 0 | 1, j: 0 | 1): [number, number] => [
			xs[i] * M[0] + ys[j] * M[2] + M[4],
			xs[i] * M[1] + ys[j] * M[3] + M[5],
		];
		const p00 = wp(0, 0);
		const p10 = wp(1, 0);
		const p01 = wp(0, 1);
		const p11 = wp(1, 1);
		pushVert(p00[0], p00[1], uv[0], uv[1], rgb, alpha);
		pushVert(p10[0], p10[1], uv[2], uv[1], rgb, alpha);
		pushVert(p01[0], p01[1], uv[0], uv[3], rgb, alpha);
		pushVert(p10[0], p10[1], uv[2], uv[1], rgb, alpha);
		pushVert(p11[0], p11[1], uv[2], uv[3], rgb, alpha);
		pushVert(p01[0], p01[1], uv[0], uv[3], rgb, alpha);
	}

	/** The parsed path of an element, parsed again only when its `d` changed. */
	function pathOf(n: VEl): ParsedPath {
		const c = n.cache as Cached;
		const d = String(n.a.d);
		if (c.d !== d || !c.gp) {
			c.d = d;
			c.gp = parsePath(d);
		}
		return c.gp;
	}

	/** A circle is drawn as the two half arcs of a closed path. */
	function circlePath(n: VEl): ParsedPath {
		const c = n.cache as Cached;
		const cx = Number(n.a.cx) || 0;
		const cy = Number(n.a.cy) || 0;
		const r = Number(n.a.r);
		const key = `${n.a.cx || 0},${n.a.cy || 0},${n.a.r}`;
		if (!c.fake) c.fake = { k: "", d: "" };
		if (c.fake.k !== key || !c.fake.gp) {
			c.fake.k = key;
			c.fake.d = `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx - r} ${cy}A${r} ${r} 0 1 1 ${cx + r} ${cy}Z`;
			c.fake.gp = parsePath(c.fake.d);
		}
		return c.fake.gp;
	}

	// `pen` (0..1, on any element) is the entrance: strokes are drawn along their length up to it, fills and labels fade in at the end
	function walk(n: VEl, M: Matrix, alphaIn: number, fill: string | null, penIn: number): void {
		if (n.hide) return;
		const a = n.a;
		if (a.visibility === "hidden") return;
		let alpha = alphaIn;
		let pen = penIn;
		if (a.opacity !== undefined) alpha *= Number(a.opacity);
		if (a.fade !== undefined) alpha *= Number(a.fade); // an entrance that was skipped: what was not drawn yet fades in
		if (a.pen !== undefined && Number(a.pen) < pen) pen = Number(a.pen);
		if (alpha <= 0.002 || pen <= 0) return;
		const nm = n.name;
		if (nm === "g") {
			const f = a.fill !== undefined ? String(a.fill) : fill;
			const Mg = a.transform ? applyTransform(M, String(a.transform)) : M;
			for (const kid of n.kids) walk(kid, Mg, alpha, f, pen);
			return;
		}
		const fadeIn = pen < 1 ? Math.max(0, (pen - 0.75) / 0.25) : 1;
		if (nm === "use") {
			if (fill && fill !== "none")
				glyphQuad(String(a.href || "").slice(1), M, alpha * fadeIn, fill, Number(a.x) || 0);
			return;
		}
		if (nm === "circle") {
			if (!a.stroke || a.stroke === "none") return;
			strokePath(a, circlePath(n), M, alpha, pen);
			return;
		}
		if (nm !== "path" || !a.d) return;
		const fl = a.fill !== undefined ? String(a.fill) : fill;
		const gp = pathOf(n);
		if (fl && fl !== "none") fillPath(gp, M, alpha * fadeIn, fl);
		if (a.stroke && a.stroke !== "none") strokePath(a, gp, M, alpha, pen);
	}

	return {
		/** Build the instance and fill buffers for the scene, for a view that maps one world unit to `scale` pixels. */
		emit(roots: VEl[], scale: number): Emitted {
			viewScale = scale;
			nInst = 0;
			nFill = 0;
			const I: Matrix = [1, 0, 0, 1, 0, 0];
			for (const r of roots) walk(r, I, 1, null, 1);
			return { inst: inst32, nInst, fill: fill32, nFill };
		},
	};
}
