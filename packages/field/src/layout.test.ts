import assert from "node:assert/strict";
import { test } from "node:test";
import { heroLayout } from "./fixture.ts";
import { segSegIntersect } from "./geometry.ts";
import {
	assignSatellites,
	buildEdges,
	buildNodes,
	layoutHome,
	proximityBonds,
	segHitsRects,
} from "./layout.ts";
import { createRng } from "./math.ts";
import type { Layout, LayoutState } from "./types.ts";

function build(seed: number, w = 1440, h = 900): { S: LayoutState; layout: Layout } {
	const layout = heroLayout(w, h);
	const S: LayoutState = {
		nodes: [],
		edges: [],
		rects: [],
		autoBonds: null,
		satIds: {},
		bonds: [],
	};
	const rand = createRng(seed);
	buildNodes(S, layout, rand);
	layoutHome(S, layout, rand);
	assignSatellites(S, layout);
	buildEdges(S);
	return { S, layout };
}

test("the master's fifteen nodes become four very large, two large, five medium and four small, plus the page's anchors", () => {
	const { S } = build(20);
	assert.equal(S.nodes.length, 20);
	const count = (c: string) => S.nodes.filter((n) => n.cls === c).length;
	assert.deepEqual([count("xl"), count("l"), count("m"), count("s")], [4, 2, 5, 4]);
	assert.equal(S.nodes.filter((n) => n.fixed).length, 5);
	assert.equal(S.nodes.filter((n) => n.kind === "cap").length, 4);
});

test("a size class scales every dimension of its nodes together", () => {
	const { S } = build(20);
	const largest = S.nodes.filter((n) => n.cls === "xl").sort((a, b) => b.R - a.R)[0];
	assert.ok(largest);
	assert.ok(Math.abs(largest.R - 224 * 1.3) < 1e-9);
	assert.ok(Math.abs(largest.ro - 140 * 1.3) < 1e-9);
});

test("the same seed lays out the same field, another seed another", () => {
	const a = build(20).S.nodes.map((n) => [n.hx, n.hy]);
	const b = build(20).S.nodes.map((n) => [n.hx, n.hy]);
	const c = build(21).S.nodes.map((n) => [n.hx, n.hy]);
	assert.deepEqual(a, b);
	assert.notDeepEqual(a, c);
});

test("no node is placed over the page's text", () => {
	for (const [w, h] of [
		[1440, 900],
		[1280, 800],
		[1024, 768],
	] as const) {
		const { S } = build(20, w, h);
		for (const n of S.nodes.filter((x) => !x.fixed)) {
			for (const r of S.rects) {
				const dx = Math.max(r[0] - n.hx, 0, n.hx - r[2]);
				const dy = Math.max(r[1] - n.hy, 0, n.hy - r[3]);
				assert.ok(Math.hypot(dx, dy) >= n.R, `node ${n.id} overlaps text at ${w}x${h}`);
			}
		}
	}
});

test("satellites are well-sized field nodes inside the view, one per target at most", () => {
	const { S, layout } = build(20);
	const ids = Object.values(S.satIds);
	assert.equal(new Set(ids).size, ids.length);
	for (const key of Object.keys(S.satIds)) assert.ok(layout.satTargets.some((t) => t.key === key));
	for (const id of ids) {
		const n = S.nodes[id];
		assert.ok(n);
		assert.equal(n.kind, "sat");
		assert.equal(n.fixed, false);
		assert.ok(n.R >= 92 * 0.45);
	}
});

test("a larger satellite carries orbiting details and a smaller one does not", () => {
	for (const seed of [20, 7, 99]) {
		const { S } = build(seed, 1920, 1080);
		for (const id of Object.values(S.satIds)) {
			const n = S.nodes[id];
			assert.ok(n);
			if (n.R >= 150) assert.ok(n.style === "holes" || n.style === "kidney");
			else assert.equal(n.style, "plain");
		}
	}
});

test("webs: no pair twice, bonded ones first, and every bond the layout asked for exists", () => {
	const { S } = build(20);
	const keys = S.edges.map((e) => `${Math.min(e.i, e.j)}-${Math.max(e.i, e.j)}`);
	assert.equal(new Set(keys).size, keys.length);
	for (const b of S.bonds) {
		assert.ok(
			S.edges.some(
				(e) => e.ed.bonded && ((e.i === b[0] && e.j === b[1]) || (e.i === b[1] && e.j === b[0])),
			),
		);
	}
	assert.ok(S.edges.every((e) => (e.ed.bonded ? e.u === 1 : e.u === 0)));
	assert.ok(S.edges.every((e) => !(S.nodes[e.i]?.fixed && S.nodes[e.j]?.fixed)));
});

test("neighbour webs: at most four per node, none crossing text, none crossing each other", () => {
	const { S } = build(20);
	const bonds = proximityBonds(S);
	const degree = new Map<number, number>();
	for (const [i, j] of bonds) {
		degree.set(i, (degree.get(i) ?? 0) + 1);
		degree.set(j, (degree.get(j) ?? 0) + 1);
	}
	for (const d of degree.values()) assert.ok(d <= 4);
	for (const [i, j] of bonds) {
		const a = S.nodes[i];
		const b = S.nodes[j];
		assert.ok(a && b);
		assert.equal(segHitsRects(S, a.hx, a.hy, b.hx, b.hy), false);
	}
	for (let p = 0; p < bonds.length; p++) {
		for (let q = p + 1; q < bonds.length; q++) {
			const [a, b] = bonds[p] as [number, number];
			const [c, d] = bonds[q] as [number, number];
			if (a === c || a === d || b === c || b === d) continue;
			const [na, nb, nc, nd] = [S.nodes[a], S.nodes[b], S.nodes[c], S.nodes[d]];
			assert.ok(na && nb && nc && nd);
			assert.equal(segSegIntersect(na.hx, na.hy, nb.hx, nb.hy, nc.hx, nc.hy, nd.hx, nd.hy), false);
		}
	}
});

test("a segment hits a rectangle when it passes through it", () => {
	const S = { rects: [[10, 10, 20, 20]] } as unknown as LayoutState;
	assert.equal(segHitsRects(S, 0, 15, 30, 15), true);
	assert.equal(segHitsRects(S, 0, 5, 30, 5), false);
	assert.equal(segHitsRects(S, 0, 0, 9, 9), false);
	assert.equal(segHitsRects(S, 12, 12, 13, 13), true);
});
