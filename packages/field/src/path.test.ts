import assert from "node:assert/strict";
import { test } from "node:test";
import { arcCenter, parsePath } from "./path.ts";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test("lines, horizontals and verticals add up to the path's length", () => {
	const p = parsePath("M0 0L30 40H60V0");
	assert.equal(p.subs.length, 1);
	assert.equal(p.subs[0]?.segs.length, 3);
	assert.ok(near(p.len, 50 + 30 + 40));
});

test("a closed path draws its closing line", () => {
	const p = parsePath("M0 0L10 0L10 10Z");
	assert.equal(p.subs[0]?.closed, true);
	assert.equal(p.subs[0]?.segs.length, 3);
	assert.ok(near(p.len, 10 + 10 + Math.hypot(10, 10)));
});

test("several subpaths are kept apart", () => {
	const p = parsePath("M0 0L5 0M10 10L10 20");
	assert.equal(p.subs.length, 2);
	assert.ok(near(p.len, 15));
});

test("numbers may be negative, decimal or exponent forms, and separated by spaces or commas", () => {
	const p = parsePath("M-1.5,2e1L-1.5 -3.25");
	const seg = p.subs[0]?.segs[0];
	assert.ok(seg && seg.t === 0);
	assert.ok(near(seg.x0, -1.5) && near(seg.y0, 20) && near(seg.y1, -3.25));
});

test("a half circle arc has the length of half the circumference", () => {
	const p = parsePath("M0 0A50 50 0 0 1 100 0");
	assert.ok(near(p.len, Math.PI * 50, 1e-6));
	const seg = p.subs[0]?.segs[0];
	assert.ok(seg && seg.t === 1);
	assert.ok(near(seg.cx, 50) && near(seg.cy, 0));
});

test("an arc too short for its radius is stretched to the chord", () => {
	const ac = arcCenter(0, 0, 100, 0, 10, 0, 1);
	assert.ok(ac);
	assert.ok(near(ac.r, 50));
});

test("the large-arc flag picks the longer way round", () => {
	const small = arcCenter(0, 0, 60, 0, 50, 0, 1);
	const large = arcCenter(0, 0, 60, 0, 50, 1, 1);
	assert.ok(small && large);
	assert.ok(Math.abs(small.sweep) < Math.PI);
	assert.ok(Math.abs(large.sweep) > Math.PI);
});

test("a zero-length arc has no centre", () => {
	assert.equal(arcCenter(5, 5, 5, 5, 10, 0, 1), null);
});

test("anything before the first M is ignored", () => {
	const p = parsePath("L10 10M0 0L3 4");
	assert.equal(p.subs.length, 1);
	assert.ok(near(p.len, 5));
});
