/** The cursor's constants, springs and shape maths. No DOM here. */

/** Idle ring size, px. */
export const RING = 28;
/** Distance from a shape's edge where the ring starts to lean toward it, px. */
export const ZONE = 64;
/** Smallest capture radius, so tiny shapes are still easy to hit. */
export const MIN_R = 28;
/** Fraction of the gap to the dot that a docked node closes. */
export const MEET = 0.3;
/** ... capped at this fraction of the node's radius. */
export const MAX_PULL = 0.16;
/** px/s: faster than this the pointer only passes over a shape. */
export const FAST = 1200;
/** Seconds the pointer has to rest in a shape before it docks. */
export const DWELL = 0.06;
/** An element leans toward the pointer by at most this many px. */
export const LEAN_MAX = 5;
/** The pointer leaves a docked shape this far (fraction of its radius) outside it. */
export const LEAVE = 0.12;
/** How far from a shape a candidate can matter at all: the lean zone plus the largest enlargement. */
export const PAD = ZONE + MIN_R + 6;

export function smooth(t: number): number {
	const x = t < 0 ? 0 : t > 1 ? 1 : t;
	return x * x * (3 - 2 * x);
}

/** A spring that moves a value toward its target: w is the stiffness (rad/s), z the damping ratio (1: no overshoot). */
export class Spring {
	v: number;
	vel = 0;

	constructor(v: number) {
		this.v = v;
	}

	step(target: number, w: number, z: number, dt: number): number {
		const n = Math.ceil(dt / 0.004); // small fixed sub-steps keep the spring smooth whatever the frame time
		const h = dt / n;
		for (let i = 0; i < n; i++) {
			this.vel += (w * w * (target - this.v) - 2 * z * w * this.vel) * h;
			this.v += this.vel * h;
		}
		return this.v;
	}
}

/** A shape the ring can take: a rounded rectangle on the screen, with where it would sit if it were not pulled. */
export type Shape = {
	cx: number;
	cy: number;
	/** where the centre would be without the pull toward the pointer */
	hx: number;
	hy: number;
	w: number;
	h: number;
	/** corner radius */
	r: number;
};

/** Distance from the pointer to the shape's edge (negative inside): a rounded rectangle, enlarged so tiny shapes are easy to hit. */
export function edgeDistance(g: Shape, px: number, py: number): number {
	const grow = Math.max(MIN_R - Math.min(g.w, g.h) / 2, 0);
	const r = g.r + grow;
	const qx = Math.abs(px - g.cx) - (g.w / 2 + grow - r);
	const qy = Math.abs(py - g.cy) - (g.h / 2 + grow - r);
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** A corner radius as the style gives it (px or %), never more than a capsule. */
export function cornerRadius(value: string, w: number, h: number): number {
	const pct = value.includes("%");
	const n = Number.parseFloat(value) || 0;
	return Math.min(pct ? (n / 100) * Math.min(w, h) : n, Math.min(w, h) / 2);
}

/** The free ring's stretch along its velocity: the axis turns by the shortest way and the amount eases. */
export type Stretch = { a: number; s: number };

export function stepStretch(
	str: Stretch,
	velX: number,
	velY: number,
	docked: boolean,
	dt: number,
): void {
	const rv = Math.hypot(velX, velY);
	if (rv > 160) {
		let da = Math.atan2(velY, velX) - str.a;
		da = Math.atan2(Math.sin(da), Math.cos(da));
		if (Math.abs(da) > 1.2)
			str.a += da; // a reversal: the stretch is nearly gone at this point, so turning is invisible
		else str.a += da * (1 - Math.exp(-dt * 14));
	}
	str.s +=
		((docked ? 0 : Math.min(0.26, rv / 3200)) - str.s) * (1 - Math.exp(-dt * (docked ? 30 : 12)));
}
