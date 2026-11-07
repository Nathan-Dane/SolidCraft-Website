/** Where each label glyph sits in the texture atlas, and the font-unit box one glyph is drawn into. */
import { glyphId } from "./scene.ts";

export const CELL_W = 112;
export const CELL_H = 144;
export const COLS = 9;
export const ATLAS_W = 1024;
export const ATLAS_H = 512;
/** Pixels per font unit in the atlas. */
export const PXU = 0.11;
/** The glyph quad in font units. */
export const LX0 = -100;
export const LY1 = 900;
export const LW = 800;
export const LH = 1100;

export type Cell = { ch: string; ox: number; oy: number };

export type AtlasLayout = {
	cells: Cell[];
	/** glyph id -> [u0, v0, u1, v1] */
	uv: Record<string, [number, number, number, number]>;
	/** a solid texel for plain fills */
	solid: [number, number];
};

export function atlasLayout(chars: Iterable<string>): AtlasLayout {
	const cells: Cell[] = [];
	const uv: AtlasLayout["uv"] = {};
	let i = 0;
	for (const ch of chars) {
		const col = i % COLS;
		const row = Math.floor(i / COLS);
		const ox = col * CELL_W + 12;
		const oy = row * CELL_H + 11;
		cells.push({ ch, ox, oy });
		uv[glyphId(ch)] = [
			ox / ATLAS_W,
			oy / ATLAS_H,
			(ox + LW * PXU) / ATLAS_W,
			(oy + LH * PXU) / ATLAS_H,
		];
		i++;
	}
	return { cells, uv, solid: [(ATLAS_W - 4) / ATLAS_W, (ATLAS_H - 4) / ATLAS_H] };
}
