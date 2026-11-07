/*
 * The WebGL renderer: the scene's strokes drawn as instanced quads whose fragment shader evaluates the exact distance (see
 * shaders.ts), and its fills and glyph labels as textured triangles. `createGLRenderer` returns null when WebGL is unavailable,
 * is software-only, or lacks highp float in fragment shaders; the caller then uses the poster.
 */
import { ATLAS_H, ATLAS_W, atlasLayout, LX0, LY1, PXU } from "./atlas.ts";
import { createEmitter, type Emitted, FILL_STRIDE, STRIDE } from "./emit.ts";
import { GLYPHS } from "./glyphs.ts";
import { scene, type VEl } from "./scene.ts";
import { FILL_FRAGMENT, FILL_VERTEX, STROKE_FRAGMENT, STROKE_VERTEX } from "./shaders.ts";
import type { View } from "./types.ts";

export type RendererOptions = {
	/** The highest device-pixel ratio drawn at (default 2). */
	maxDpr?: number;
};

export type GLRenderer = {
	/** Called when the context is lost for good. */
	onlost: (() => void) | null;
	/** Fit the canvas to its CSS size at the current pixel ratio. */
	resize(): void;
	setMaxDpr(m: number): void;
	/** Build the GPU data for the scene (returns the number of strokes). */
	emit(vb: View): number;
	/** Draw if the scene changed (or `force`). */
	draw(vb: View, force?: boolean): void;
	/** Upload what `emit` built and draw it. */
	submit(vb: View): void;
};

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
	const sh = gl.createShader(type);
	if (!sh) throw new Error("shader: none");
	gl.shaderSource(sh, src);
	gl.compileShader(sh);
	if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
		throw new Error(`shader: ${gl.getShaderInfoLog(sh)}`);
	return sh;
}

// attribute slots are fixed (stroke program 0-6, fill program 7-9) so vertex state is set up once, not per frame
function program(
	gl: WebGLRenderingContext,
	vs: string,
	fs: string,
	names: string[],
	first: number,
): WebGLProgram {
	const p = gl.createProgram();
	if (!p) throw new Error("link: none");
	gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
	gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
	names.forEach((n, i) => {
		gl.bindAttribLocation(p, first + i, n);
	});
	gl.linkProgram(p);
	if (!gl.getProgramParameter(p, gl.LINK_STATUS))
		throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
	return p;
}

/** The glyph outlines drawn once into a canvas, to become a mip-mapped alpha texture. */
function rasteriseAtlas(layout: ReturnType<typeof atlasLayout>): HTMLCanvasElement {
	const cv = document.createElement("canvas");
	cv.width = ATLAS_W;
	cv.height = ATLAS_H;
	const cx = cv.getContext("2d");
	if (!cx) throw new Error("atlas: no 2d context");
	cx.fillStyle = "#fff";
	for (const cell of layout.cells) {
		cx.save();
		cx.setTransform(PXU, 0, 0, -PXU, cell.ox - LX0 * PXU, cell.oy + LY1 * PXU);
		cx.fill(new Path2D(GLYPHS[cell.ch]));
		cx.restore();
	}
	// a solid texel for plain fills
	cx.fillRect(ATLAS_W - 8, ATLAS_H - 8, 8, 8);
	return cv;
}

export function createGLRenderer(
	canvas: HTMLCanvasElement,
	roots: VEl[],
	opts: RendererOptions = {},
): GLRenderer | null {
	const attrs: WebGLContextAttributes = {
		alpha: true,
		antialias: false,
		premultipliedAlpha: true,
		depth: false,
		stencil: false,
		powerPreference: "low-power", // a quiet backdrop does not need the discrete GPU
		failIfMajorPerformanceCaveat: true,
	};
	let gl: WebGLRenderingContext | null = null;
	try {
		gl = (canvas.getContext("webgl", attrs) as WebGLRenderingContext | null) ?? null;
	} catch {
		gl = null;
	}
	if (!gl) return null;
	const ctx = gl;
	const inst = ctx.getExtension("ANGLE_instanced_arrays");
	const hp = ctx.getShaderPrecisionFormat?.(ctx.FRAGMENT_SHADER, ctx.HIGH_FLOAT);
	if (!inst || !hp || hp.precision < 20) return null;

	let maxDpr = opts.maxDpr || 2;
	let failed = false;
	let P1: WebGLProgram;
	let P2: WebGLProgram;
	let instBuf: WebGLBuffer | null = null;
	let fillBuf: WebGLBuffer | null = null;
	let lastKey = "";
	let viewScale = 1;
	let U1: { view: WebGLUniformLocation | null; size: WebGLUniformLocation | null };
	let U2: {
		view: WebGLUniformLocation | null;
		size: WebGLUniformLocation | null;
		tex: WebGLUniformLocation | null;
	};
	let built: Emitted | null = null;

	const layout = atlasLayout(Object.keys(GLYPHS));
	const emitter = createEmitter(layout);

	function init(): void {
		P1 = program(
			ctx,
			STROKE_VERTEX,
			STROKE_FRAGMENT,
			["a_corner", "a_geo", "a_bbox", "a_p", "a_col", "a_dash", "a_d2"],
			0,
		);
		P2 = program(ctx, FILL_VERTEX, FILL_FRAGMENT, ["a_pos", "a_uv", "a_col"], 7);
		U1 = { view: ctx.getUniformLocation(P1, "u_view"), size: ctx.getUniformLocation(P1, "u_size") };
		U2 = {
			view: ctx.getUniformLocation(P2, "u_view"),
			size: ctx.getUniformLocation(P2, "u_size"),
			tex: ctx.getUniformLocation(P2, "u_tex"),
		};
		lastKey = "";
		const quadBuf = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, quadBuf);
		ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), ctx.STATIC_DRAW);
		ctx.enableVertexAttribArray(0);
		ctx.vertexAttribPointer(0, 2, ctx.FLOAT, false, 0, 0);
		inst?.vertexAttribDivisorANGLE(0, 0);
		instBuf = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, instBuf);
		for (let q = 0; q < 6; q++) {
			ctx.enableVertexAttribArray(1 + q);
			ctx.vertexAttribPointer(1 + q, 4, ctx.FLOAT, false, STRIDE * 4, q * 16);
			inst?.vertexAttribDivisorANGLE(1 + q, 1);
		}
		fillBuf = ctx.createBuffer();
		ctx.bindBuffer(ctx.ARRAY_BUFFER, fillBuf);
		ctx.enableVertexAttribArray(7);
		ctx.vertexAttribPointer(7, 2, ctx.FLOAT, false, FILL_STRIDE * 4, 0);
		ctx.enableVertexAttribArray(8);
		ctx.vertexAttribPointer(8, 2, ctx.FLOAT, false, FILL_STRIDE * 4, 8);
		ctx.enableVertexAttribArray(9);
		ctx.vertexAttribPointer(9, 4, ctx.FLOAT, false, FILL_STRIDE * 4, 16);
		const tex = ctx.createTexture();
		ctx.bindTexture(ctx.TEXTURE_2D, tex);
		ctx.pixelStorei(ctx.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
		ctx.texImage2D(
			ctx.TEXTURE_2D,
			0,
			ctx.RGBA,
			ctx.RGBA,
			ctx.UNSIGNED_BYTE,
			rasteriseAtlas(layout),
		);
		ctx.generateMipmap(ctx.TEXTURE_2D);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MIN_FILTER, ctx.LINEAR_MIPMAP_LINEAR);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_MAG_FILTER, ctx.LINEAR);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_S, ctx.CLAMP_TO_EDGE);
		ctx.texParameteri(ctx.TEXTURE_2D, ctx.TEXTURE_WRAP_T, ctx.CLAMP_TO_EDGE);
		ctx.clearColor(0, 0, 0, 0);
		ctx.enable(ctx.BLEND);
		ctx.blendFunc(ctx.ONE, ctx.ONE_MINUS_SRC_ALPHA);
		ctx.disable(ctx.DEPTH_TEST);
	}
	try {
		init();
	} catch (err) {
		console.warn("WebGL init failed:", err instanceof Error ? err.message : err);
		return null;
	}

	const api: GLRenderer = {
		onlost: null,
		resize() {
			const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
			const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
			const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w;
				canvas.height = h;
			}
			scene.dirty = true;
		},
		setMaxDpr(m) {
			maxDpr = m;
			api.resize();
		},
		emit(vb) {
			viewScale = canvas.width / vb.w;
			built = emitter.emit(roots, viewScale);
			return built.nInst;
		},
		draw(vb, force) {
			if (failed || (!scene.dirty && !force)) return;
			scene.dirty = false;
			api.emit(vb);
			api.submit(vb);
		},
		submit(vb) {
			if (!built) return;
			const key = `${canvas.width}x${canvas.height}:${vb.x},${vb.y},${viewScale}`;
			if (key !== lastKey) {
				lastKey = key;
				ctx.viewport(0, 0, canvas.width, canvas.height);
				ctx.useProgram(P1);
				ctx.uniform4f(U1.view, vb.x, vb.y, viewScale, 0);
				ctx.uniform2f(U1.size, canvas.width, canvas.height);
				ctx.useProgram(P2);
				ctx.uniform4f(U2.view, vb.x, vb.y, viewScale, 0);
				ctx.uniform2f(U2.size, canvas.width, canvas.height);
				ctx.uniform1i(U2.tex, 0);
			}
			ctx.clear(ctx.COLOR_BUFFER_BIT);
			if (built.nInst) {
				ctx.useProgram(P1);
				ctx.bindBuffer(ctx.ARRAY_BUFFER, instBuf);
				ctx.bufferData(
					ctx.ARRAY_BUFFER,
					built.inst.subarray(0, built.nInst * STRIDE),
					ctx.STREAM_DRAW,
				);
				inst?.drawArraysInstancedANGLE(ctx.TRIANGLE_STRIP, 0, 4, built.nInst);
			}
			if (built.nFill) {
				ctx.useProgram(P2);
				ctx.bindBuffer(ctx.ARRAY_BUFFER, fillBuf);
				ctx.bufferData(
					ctx.ARRAY_BUFFER,
					built.fill.subarray(0, built.nFill * FILL_STRIDE),
					ctx.STREAM_DRAW,
				);
				ctx.drawArrays(ctx.TRIANGLES, 0, built.nFill);
			}
		},
	};

	canvas.addEventListener(
		"webglcontextlost",
		(e) => {
			e.preventDefault();
			failed = true;
			api.onlost?.();
		},
		false,
	);
	canvas.addEventListener(
		"webglcontextrestored",
		() => {
			try {
				init();
				failed = false;
				scene.dirty = true;
			} catch {
				api.onlost?.();
			}
		},
		false,
	);

	api.resize();
	return api;
}
