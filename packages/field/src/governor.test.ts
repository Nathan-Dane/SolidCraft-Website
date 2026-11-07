import assert from "node:assert/strict";
import { test } from "node:test";
import { createGovernor, type Decision } from "./governor.ts";

function feed(g: ReturnType<typeof createGovernor>, gap: number, n: number): Decision {
	let last: Decision = "keep";
	for (let i = 0; i < n; i++) {
		const d = g.push(gap);
		if (d !== "keep") last = d;
	}
	return last;
}

test("a smooth field keeps its pixel ratio", () => {
	const g = createGovernor();
	assert.equal(feed(g, 16.7, 900), "keep");
	assert.equal(g.dpr, 2);
});

test("a slow window steps the pixel ratio down, one level at a time", () => {
	const g = createGovernor();
	assert.deepEqual(feed(g, 40, 90), { dpr: 1.5 });
	assert.equal(g.dpr, 1.5);
	assert.deepEqual(feed(g, 40, 90), { dpr: 1 });
	assert.equal(g.dpr, 1);
});

test("a few slow frames do not matter, the median does", () => {
	const g = createGovernor();
	for (let i = 0; i < 80; i++) g.push(16);
	let d: Decision = "keep";
	for (let i = 0; i < 10; i++) d = g.push(200);
	assert.equal(d, "keep");
	assert.equal(g.dpr, 2);
});

test("at the lowest level only repeated, far-too-slow windows give up the live field", () => {
	const g = createGovernor({ levels: [1] });
	assert.equal(feed(g, 50, 90), "keep"); // one strike
	assert.equal(feed(g, 50, 90), "poster");
});

test("a good window at the lowest level clears the strikes", () => {
	const g = createGovernor({ levels: [1] });
	assert.equal(feed(g, 50, 90), "keep");
	assert.equal(feed(g, 16, 90), "keep");
	assert.equal(feed(g, 50, 90), "keep");
});

test("a window between slow and far too slow at the lowest level is tolerated", () => {
	const g = createGovernor({ levels: [1] });
	assert.equal(feed(g, 35, 900), "keep");
});
