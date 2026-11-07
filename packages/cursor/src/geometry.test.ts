import assert from "node:assert/strict";
import { test } from "node:test";
import {
	cornerRadius,
	edgeDistance,
	MIN_R,
	type Shape,
	Spring,
	smooth,
	stepStretch,
} from "./geometry.ts";

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const box = (w: number, h: number, r: number): Shape => ({
	cx: 100,
	cy: 100,
	hx: 100,
	hy: 100,
	w,
	h,
	r,
});

test("smooth eases between 0 and 1 and clamps", () => {
	assert.equal(smooth(-1), 0);
	assert.equal(smooth(2), 1);
	assert.equal(smooth(0.5), 0.5);
});

test("a spring settles on its target, with a small overshoot when under-damped", () => {
	const s = new Spring(0);
	let peak = 0;
	for (let i = 0; i < 400; i++) {
		s.step(10, 26, 0.62, 1 / 60);
		peak = Math.max(peak, s.v);
	}
	assert.ok(near(s.v, 10, 1e-3));
	assert.ok(peak > 10 && peak < 12);
});

test("a critically damped spring does not overshoot, whatever the frame time", () => {
	for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
		const s = new Spring(0);
		let peak = 0;
		for (let i = 0; i < 600; i++) {
			s.step(10, 26, 1, dt);
			peak = Math.max(peak, s.v);
		}
		assert.ok(peak <= 10 + 1e-3);
		assert.ok(near(s.v, 10, 1e-2));
	}
});

test("the distance to a rounded rectangle is negative inside, zero on the edge and the straight distance outside", () => {
	const g = box(200, 100, 0);
	assert.ok(near(edgeDistance(g, 100, 100), -50));
	assert.ok(near(edgeDistance(g, 200, 100), 0));
	assert.ok(near(edgeDistance(g, 230, 100), 30));
	assert.ok(near(edgeDistance(g, 100, 180), 30));
});

test("a corner rounds the distance: the diagonal is farther from a round corner than a square one", () => {
	const square = box(200, 100, 0);
	const round = box(200, 100, 50);
	assert.ok(edgeDistance(round, 215, 165) > edgeDistance(square, 215, 165) - 0.001);
	assert.ok(near(edgeDistance(round, 100, 100), -50));
});

test("a tiny shape is enlarged to the smallest capture radius", () => {
	const dot = box(10, 10, 5);
	assert.ok(edgeDistance(dot, 100 + MIN_R - 1, 100) < 0);
	assert.ok(edgeDistance(dot, 100 + MIN_R + 1, 100) > 0);
});

test("corner radii read from px or %, and never exceed a capsule", () => {
	assert.equal(cornerRadius("12px", 100, 40), 12);
	assert.equal(cornerRadius("50%", 100, 40), 20);
	assert.equal(cornerRadius("999px", 100, 40), 20);
	assert.equal(cornerRadius("", 100, 40), 0);
});

test("the ring stretches along its motion, turns the short way, and relaxes when docked", () => {
	const str = { a: 0, s: 0 };
	for (let i = 0; i < 60; i++) stepStretch(str, 1000, 0, false, 1 / 60);
	assert.ok(str.s > 0.1 && str.s <= 0.26);
	assert.ok(Math.abs(str.a) < 0.01);
	stepStretch(str, -1000, 50, false, 1 / 60); // a reversal turns at once
	assert.ok(Math.abs(Math.abs(str.a) - Math.PI) < 0.1);
	for (let i = 0; i < 90; i++) stepStretch(str, 1000, 0, true, 1 / 60);
	assert.ok(str.s < 0.001);
});

test("a slow ring does not turn its axis", () => {
	const str = { a: 0.5, s: 0 };
	stepStretch(str, 10, 10, false, 1 / 60);
	assert.equal(str.a, 0.5);
});
