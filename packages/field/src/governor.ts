/*
 * Quality follows frame time. A window of frame gaps is judged by its median: when the field is too slow it is drawn at a lower
 * pixel ratio first, and only when even the lowest is far too slow does the page give up the live field for the poster.
 */
export type Decision = "keep" | "poster" | { dpr: number };

export type GovernorOptions = {
	/** The pixel ratios to draw at, highest first. */
	levels?: number[];
	/** A window whose median gap is over this (ms) steps the pixel ratio down. */
	slowMs?: number;
	/** At the lowest level, windows over this (ms) count as strikes toward the poster. */
	fallbackMs?: number;
	/** Frame gaps per window. */
	window?: number;
	/** Strikes at the lowest level before giving up the live field. */
	strikes?: number;
};

export function createGovernor(opts: GovernorOptions = {}) {
	const { levels = [2, 1.5, 1], slowMs = 30, fallbackMs = 45, window = 90, strikes = 2 } = opts;
	let level = 0;
	let struck = 0;
	let gaps: number[] = [];

	return {
		/** The pixel ratio the field is drawn at now (a cap; the display's own ratio may be lower). */
		get dpr(): number {
			return levels[level] as number;
		},
		/** Report one frame gap in ms; returns what to do about it. */
		push(gap: number): Decision {
			gaps.push(gap);
			if (gaps.length < window) return "keep";
			const sorted = gaps.slice().sort((a, b) => a - b);
			gaps = [];
			const median = sorted[sorted.length >> 1] as number;
			const lowest = level === levels.length - 1;
			if (lowest) {
				struck = median > fallbackMs ? struck + 1 : 0;
				return struck >= strikes ? "poster" : "keep";
			}
			if (median > slowMs) {
				level++;
				struck = 0;
				return { dpr: levels[level] as number };
			}
			return "keep";
		},
	};
}
