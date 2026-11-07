import assert from "node:assert/strict";
import { test } from "node:test";
import { barSolid, datumShift } from "./scroll.ts";

test("the bar is clear until 55% of the window, solid from 70%", () => {
	assert.equal(barSolid(0, 800), 0);
	assert.equal(barSolid(440, 800), 0);
	assert.equal(barSolid(560, 800), 1);
	assert.equal(barSolid(5000, 800), 1);
	assert.ok(Math.abs(barSolid(500, 800) - 0.5) < 1e-9);
});

test("the datum sheet moves at 12% of the scroll and wraps by whole tiles", () => {
	assert.equal(datumShift(0, 200), -0);
	assert.ok(Math.abs(datumShift(500, 200) - -60) < 1e-9);
	assert.ok(Math.abs(datumShift(2500, 200) - -100) < 1e-9);
	assert.ok(Math.abs(datumShift(3333, 200) - -((3333 * 0.12) % 200)) < 1e-9);
});
