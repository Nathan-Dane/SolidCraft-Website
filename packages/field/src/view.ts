import { MASTER } from "./geometry.ts";
import type { View } from "./types.ts";

/** The window's view of the drawing: the world rectangle shown, and how many pixels one world unit is. */
export type ViewBox = View & { s: number };

/** The drawing covers the window, centred and cropped: a uniform scale, as `object-fit: cover`. */
export function fitView(width: number, height: number): ViewBox {
	const s = Math.max(width / MASTER.W, height / MASTER.H);
	const w = width / s;
	const h = height / s;
	return { x: (MASTER.W - w) / 2, y: (MASTER.H - h) / 2, w, h, s };
}
