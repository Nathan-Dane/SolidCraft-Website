import { lerp } from "./math.ts";

export const COL = {
	outline: "#64aad3",
	ring: "#4588b1",
	slot: "#3f7fa7",
	cons: "#3f7396",
	axis: "#40739a",
	cross: "#4f81a8",
	pitch: "#3f7396",
	dim: "#8fbad6",
	hot: "#dff4ff",
} as const;

export type ColourName = keyof typeof COL;

function hexRgb(h: string): [number, number, number] {
	return [
		Number.parseInt(h.slice(1, 3), 16),
		Number.parseInt(h.slice(3, 5), 16),
		Number.parseInt(h.slice(5, 7), 16),
	];
}

const RGB = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, hexRgb(v)])) as Record<
	ColourName,
	[number, number, number]
>;

/** A colour of the palette, brightened toward the "hot" colour by t (0 to 1). */
export function mix(name: ColourName, t: number): string {
	const a = RGB[name];
	const b = RGB.hot;
	return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
