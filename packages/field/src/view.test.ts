import assert from "node:assert/strict";
import { test } from "node:test";
import { fitView } from "./view.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("a window of the drawing's own shape shows all of it at its natural scale", () => {
	const v = fitView(2560, 1440);
	assert.ok(near(v.s, 1) && near(v.x, 0) && near(v.y, 0) && near(v.w, 2560) && near(v.h, 1440));
});

test("a taller window crops the sides and a wider one crops the top and bottom, always centred", () => {
	const tall = fitView(390, 844);
	assert.ok(near(tall.s, 844 / 1440));
	assert.ok(near(tall.y, 0) && tall.w < 2560 && near(tall.x, (2560 - tall.w) / 2));
	const wide = fitView(2000, 600);
	assert.ok(near(wide.s, 2000 / 2560));
	assert.ok(near(wide.x, 0) && wide.h < 1440 && near(wide.y, (1440 - wide.h) / 2));
});

test("a world unit is s pixels: the view spans the window exactly", () => {
	const v = fitView(1280, 800);
	assert.ok(near(v.w * v.s, 1280) && near(v.h * v.s, 800));
});
