import assert from "node:assert/strict";
import { test } from "node:test";
import { clamp, createRng, distSeg, easeInOut, easeOut, lerp, smooth } from "./math.ts";

test("the same seed gives the same sequence, another seed another", () => {
	const a = createRng(20);
	const b = createRng(20);
	const c = createRng(21);
	const first = [a(), a(), a()];
	assert.deepEqual(first, [b(), b(), b()]);
	assert.notDeepEqual(first, [c(), c(), c()]);
	for (const v of first) assert.ok(v >= 0 && v < 1);
});

test("clamp, lerp and the easings hit their ends", () => {
	assert.equal(clamp(5, 0, 3), 3);
	assert.equal(clamp(-1, 0, 3), 0);
	assert.equal(lerp(10, 20, 0.5), 15);
	for (const f of [smooth, easeInOut, easeOut]) {
		assert.equal(f(-1), 0);
		assert.equal(f(0), 0);
		assert.equal(f(1), 1);
		assert.equal(f(2), 1);
	}
	assert.equal(easeInOut(0.5), 0.5);
});

test("the distance to a segment is to its nearest point, ends included", () => {
	assert.equal(distSeg(5, 3, 0, 0, 10, 0), 3);
	assert.equal(distSeg(-4, 3, 0, 0, 10, 0), 5);
	assert.equal(distSeg(3, 4, 0, 0, 0, 0), 5);
});
