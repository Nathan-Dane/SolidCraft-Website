import assert from "node:assert/strict";
import { test } from "node:test";
import {
	angDist,
	bossPath,
	edgeGeom,
	MASTER,
	neck,
	outline,
	outlineD,
	segSegIntersect,
	slotFor,
	solveBlend,
	solveStraight,
	TAU,
	verifyOutline,
	wrap,
} from "./geometry.ts";

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

test("the master has fifteen bosses and nineteen webs", () => {
	assert.equal(MASTER.nodes.length, 15);
	assert.equal(MASTER.edges.length, 19);
	for (const e of MASTER.edges) {
		assert.ok(MASTER.nodes[e.i] && MASTER.nodes[e.j], `web ${e.k} joins existing nodes`);
	}
});

test("every web of the master can be built and its outline is tangent to both bosses", () => {
	for (const e of MASTER.edges) {
		const a = MASTER.nodes[e.i];
		const b = MASTER.nodes[e.j];
		assert.ok(a && b);
		const g = edgeGeom(a, b, e);
		assert.ok(g, `web ${e.k} has geometry`);
		for (const side of [1, -1] as const) {
			const o = outline(a, b, g, side);
			const v = verifyOutline(a, b, g, o);
			assert.ok(v.sin < 1e-9, `web ${e.k} side ${side}: contact off by ${v.sin}`);
			assert.ok(v.line < 1e-9, `web ${e.k} side ${side}: line not tangent (${v.line})`);
		}
	}
});

test("a blend circle reaches exactly the neck half-width from the centre line", () => {
	const w = 0.09 * 100;
	const blend = solveBlend(500, 100, 140, w);
	assert.ok(blend);
	assert.ok(near(blend.fp - blend.Rb, w, 1e-6));
});

test("a blend is refused when the bosses touch", () => {
	assert.equal(solveBlend(200, 100, 100, 9), null);
});

test("a straight web keeps at least the minimum length by shrinking its fillets", () => {
	const s = solveStraight(400, 110, 110, 9.9, 60, 120);
	assert.ok(s);
	assert.ok(s.len >= 120 - 1e-6);
	assert.ok(s.rf <= 60);
	assert.equal(solveStraight(300, 110, 110, 9.9, 60, 300), null);
});

test("the straight span of a web is as long as the geometry says", () => {
	const e = MASTER.edges.find((x) => x.type === "S");
	assert.ok(e);
	const a = MASTER.nodes[e.i];
	const b = MASTER.nodes[e.j];
	assert.ok(a && b);
	const g = edgeGeom(a, b, e);
	assert.ok(g);
	const o = outline(a, b, g, 1);
	assert.ok(o.line);
	assert.ok(
		near(Math.hypot(o.line.x2 - o.line.x1, o.line.y2 - o.line.y1), g.len ?? Number.NaN, 1e-6),
	);
	assert.equal(o.arcs.length, 2);
	assert.match(outlineD(o), /^M[\d.-]+ [\d.-]+A.*L.*A/);
});

test("the neck is 9% of the smaller boss", () => {
	assert.equal(neck({ x: 0, y: 0, R: 100 }, { x: 0, y: 0, R: 200 }), 9);
});

test("angles wrap into one turn and distances take the short way round", () => {
	assert.ok(near(wrap(-0.5), TAU - 0.5));
	assert.ok(near(wrap(TAU + 1), 1));
	assert.ok(near(angDist(0.1, TAU - 0.1), 0.2));
});

test("segments cross only when they properly intersect", () => {
	assert.equal(segSegIntersect(0, 0, 10, 10, 0, 10, 10, 0), true);
	assert.equal(segSegIntersect(0, 0, 10, 0, 0, 5, 10, 5), false);
	assert.equal(segSegIntersect(0, 0, 4, 4, 5, 5, 9, 9), false);
});

test("a boss with no openings is a full circle, and an opening removes a sector", () => {
	const n = { x: 100, y: 100, R: 50 };
	assert.equal((bossPath(n, []).match(/A/g) ?? []).length, 2);
	assert.equal((bossPath(n, [{ a: 0, w: 0.3 }]).match(/M/g) ?? []).length, 1);
	assert.equal(
		(
			bossPath(n, [
				{ a: 0, w: 0.3 },
				{ a: Math.PI, w: 0.3 },
			]).match(/M/g) ?? []
		).length,
		2,
	);
});

test("a slot sits in material with a wall and never wider than 7.5", () => {
	const e = MASTER.edges.find((x) => x.slot !== null);
	assert.ok(e);
	const a = MASTER.nodes[e.i];
	const b = MASTER.nodes[e.j];
	assert.ok(a && b);
	const g = edgeGeom(a, b, e);
	assert.ok(g);
	const slot = slotFor(a, b, g, e);
	assert.ok(slot);
	assert.ok(slot.hw <= 7.5);
	assert.ok(slot.a >= 4);
	assert.equal(slotFor(a, b, g, { slot: null }), null);
});
