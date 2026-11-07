import assert from "node:assert/strict";
import { test } from "node:test";
import { fieldOpacity, satelliteOpacity } from "./parallax.ts";

test("the satellites fade over the first fifth of a window and stay gone", () => {
	assert.equal(satelliteOpacity(0, 900), 1);
	assert.ok(Math.abs(satelliteOpacity(90, 900) - 0.5) < 0.01);
	assert.equal(satelliteOpacity(180, 900), 0);
	assert.equal(satelliteOpacity(5000, 900), 0);
});

test("the field fades out over 1.1 windows and not before it has started", () => {
	assert.equal(fieldOpacity(0, 800), 1);
	assert.ok(fieldOpacity(440, 800) > 0.4 && fieldOpacity(440, 800) < 0.6);
	assert.equal(fieldOpacity(880, 800), 0);
	assert.equal(fieldOpacity(-10, 800), 1);
});

test("both only ever fade out as the page scrolls down", () => {
	for (const f of [satelliteOpacity, fieldOpacity]) {
		let last = 2;
		for (let y = 0; y <= 1200; y += 25) {
			const v = f(y, 800);
			assert.ok(v <= last);
			last = v;
		}
	}
});
