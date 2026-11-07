/** How solid the bar is at a scroll position: it fades in between 55% and 70% of the window height. */
export function barSolid(scrollY: number, viewport: number): number {
	const from = viewport * 0.55;
	const to = viewport * 0.7;
	return Math.min(1, Math.max(0, (scrollY - from) / (to - from)));
}

/** How far the datum sheet is moved up at a scroll position: 12% of the scroll, wrapping by whole tiles. */
export function datumShift(scrollY: number, tile: number): number {
	return -((scrollY * 0.12) % tile);
}
