/** A small seeded random generator (mulberry32): the same seed gives the same layout. */
export function createRng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function clamp(v: number, lo: number, hi: number): number {
	return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function smooth(t: number): number {
	const x = clamp(t, 0, 1);
	return x * x * (3 - 2 * x);
}

export function easeInOut(t: number): number {
	const x = clamp(t, 0, 1);
	return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

export function easeOut(t: number): number {
	const x = clamp(t, 0, 1);
	return 1 - (1 - x) ** 3;
}

/** Distance from a point to a segment. */
export function distSeg(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const l2 = dx * dx + dy * dy;
	const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
	return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
