import { smooth } from "./math.ts";

/** Scroll distances, in window heights, over which the hero's parts leave. */
const SATELLITES = 0.2;
const FIELD = 1.1;

const round = (v: number): number => Math.round(v * 500) / 500;

/** How visible the satellites' icons and labels are after scrolling `y` pixels: gone after a fifth of a window. */
export function satelliteOpacity(y: number, windowHeight: number): number {
	return round(1 - smooth(y / (windowHeight * SATELLITES)));
}

/** How visible the field's canvas is: fully gone just after the hero has left the window (1.1 window heights). */
export function fieldOpacity(y: number, windowHeight: number): number {
	return round(1 - smooth(y / (windowHeight * FIELD)));
}
