import type { Layout } from "./types.ts";

/** A hero like the page's: a logo, two buttons, two text blocks and four satellite targets, for a window of w x h. */
export function heroLayout(w: number, h: number): Layout {
	const s = Math.max(w / 2560, h / 1440);
	const view = { x: (2560 - w / s) / 2, y: (1440 - h / s) / 2, w: w / s, h: h / s };
	const wx = (px: number) => view.x + px / s;
	const wy = (py: number) => view.y + py / s;
	const cx = w / 2;
	const cy = h / 2;
	const cap = (px: number, partner: number, left: boolean) => ({
		fixed: true as const,
		kind: "cap" as const,
		style: "plain" as const,
		x: wx(px),
		y: wy(cy + 190),
		R: 40,
		ro: 0,
		ri: 0,
		partner,
		pillLeft: left,
	});
	return {
		anchors: [
			{
				fixed: true,
				kind: "hero",
				style: "holes",
				x: wx(cx),
				y: wy(cy - 150),
				R: 128,
				ro: 100,
				ri: 80,
				pitch: 110,
				hole: 5,
				n: 4,
				a0: 25,
			},
			cap(cx - 270, 17, true),
			cap(cx - 30, 16, false),
			cap(cx + 30, 19, true),
			cap(cx + 270, 18, false),
		],
		rects: [
			[wx(cx - 200), wy(cy), wx(cx + 200), wy(cy + 120)],
			[wx(cx - 200), wy(cy + 250), wx(cx + 200), wy(cy + 300)],
		],
		bondSpec: [
			["s3", 16],
			["s4", 19],
		],
		satTargets: [
			{ key: "s1", x: wx(0.17 * w), y: wy(0.36 * h) },
			{ key: "s2", x: wx(0.83 * w), y: wy(0.36 * h) },
			{ key: "s3", x: wx(0.24 * w), y: wy(0.78 * h) },
			{ key: "s4", x: wx(0.76 * w), y: wy(0.78 * h) },
		],
		view,
	};
}
