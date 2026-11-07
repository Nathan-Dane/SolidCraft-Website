import assert from "node:assert/strict";
import { test } from "node:test";
import { createField } from "./field.ts";
import { heroLayout } from "./fixture.ts";
import { edgeGeom, outline, verifyOutline } from "./geometry.ts";
import type { VEl } from "./scene.ts";

function built(seed = 20, w = 1440, h = 900) {
	const layout = heroLayout(w, h);
	const field = createField({ seed });
	field.build(layout);
	field.setView(layout.view.x, layout.view.y, layout.view.w, layout.view.h);
	return { field, layout };
}

const flatten = (e: VEl): VEl[] => [e, ...e.kids.flatMap(flatten)];
const scene = (f: ReturnType<typeof createField>) =>
	JSON.stringify(f.roots.map((r) => flatten(r).map((e) => [e.name, e.a, e.hide])));

test("building makes the nodes, the webs and five drawing layers", () => {
	const { field } = built();
	assert.equal(field.state.nodes.length, 20);
	assert.ok(field.state.edges.length > 20);
	assert.equal(field.roots.length, 5);
	assert.ok(field.state.nodes.every((n) => n.els && n.ng));
});

test("the same seed makes the same drawing, step for step", () => {
	const a = built(20).field;
	const b = built(20).field;
	a.advance(12);
	b.advance(12);
	assert.equal(scene(a), scene(b));
	const c = built(21).field;
	c.advance(12);
	assert.notEqual(scene(a), scene(c));
});

test("webs form between neighbours and settle", () => {
	const { field } = built();
	field.advance(10);
	const on = field.state.edges.filter((e) => e.u > 0.9);
	assert.ok(on.length >= 8, `only ${on.length} webs formed`);
	assert.ok(field.state.edges.every((e) => e.u >= 0 && e.u <= 1));
});

test("every web that is drawn stays tangent to both bosses while the nodes drift", () => {
	const { field } = built();
	for (let k = 0; k < 6; k++) {
		field.advance(7);
		for (const e of field.state.edges) {
			if (e.u < 0.5 || !e.g) continue;
			const a = field.state.nodes[e.i];
			const b = field.state.nodes[e.j];
			assert.ok(a && b);
			const g = edgeGeom(a, b, e.ed, { RbMax: 1600, minLen: 18 });
			assert.ok(g);
			for (const side of [1, -1] as const) {
				const v = verifyOutline(a, b, g, outline(a, b, g, side));
				assert.ok(v.sin < 1e-9 && v.line < 1e-9);
			}
		}
	}
});

test("nodes stay out of the text and apart from each other", () => {
	const { field } = built();
	field.advance(40);
	const ns = field.state.nodes;
	for (const n of ns.filter((x) => !x.fixed)) {
		for (const r of field.state.rects) {
			const dx = Math.max(r[0] - n.x, 0, n.x - r[2]);
			const dy = Math.max(r[1] - n.y, 0, n.y - r[3]);
			assert.ok(Math.hypot(dx, dy) >= n.R - 1, `node ${n.id} overlaps text`);
		}
	}
	for (let i = 0; i < ns.length; i++) {
		for (let j = i + 1; j < ns.length; j++) {
			const a = ns[i];
			const b = ns[j];
			assert.ok(a && b);
			if (a.fixed && b.fixed) continue;
			assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.R + b.R - 2, `nodes ${i} and ${j} overlap`);
		}
	}
});

test("dimension labels appear with sensible readouts and never more than the limit", () => {
	const { field } = built();
	let seen = 0;
	for (let k = 0; k < 8; k++) {
		field.advance(5);
		const labels = field.state.labels;
		assert.ok(labels.length <= field.state.maxLabels + 1);
		for (const l of labels) {
			if (l.txt.str) {
				seen++;
				assert.match(l.txt.str, /^(Ø\d+|R\d+\.\d|\d+|\d+\.\d|\d+\.\d°)$/);
			}
		}
	}
	assert.ok(seen > 0);
});

test("scrolling moves the anchored nodes with the page and the others at half its speed", () => {
	const { field } = built();
	const before = field.state.nodes.map((n) => n.y);
	assert.equal(field.setScroll(100), true);
	field.state.nodes.forEach((n, i) => {
		assert.ok(Math.abs((before[i] as number) - n.y - 100 * (n.fixed ? 1 : 0.5)) < 1e-9);
	});
	assert.equal(field.setScroll(100), false);
});

test("the field is out of view once every node has scrolled above it", () => {
	const { field, layout } = built();
	assert.equal(field.allAbove(), false);
	field.setScroll(layout.view.h * 3);
	assert.equal(field.allAbove(), true);
});

test("a click sends a pulse along the webs, node by node", () => {
	const { field } = built();
	field.advance(10);
	const start = field.state.nodes.find(
		(n) => !n.fixed && field.state.edges.some((e) => e.u > 0.6 && (e.i === n.id || e.j === n.id)),
	);
	assert.ok(start);
	field.pulse(start.id);
	assert.equal(start.pulse, 1);
	assert.ok(field.state.fires.length > 0);
	field.advance(3);
	assert.equal(field.state.fires.length, 0);
});

test("the cursor's pull moves a node toward it and letting go brings it back", () => {
	const { field } = built();
	const n = field.state.nodes.find((x) => !x.fixed);
	assert.ok(n);
	field.attract(n.id, 20, 0);
	field.advance(2);
	assert.ok(n.qx > 15);
	field.attract(n.id, 0, 0);
	field.advance(3);
	assert.ok(Math.abs(n.qx) < 0.5);
});

test("hit finds the field node under a point and ignores the page's own nodes", () => {
	const { field } = built();
	const n = field.state.nodes.find((x) => !x.fixed);
	assert.ok(n);
	assert.equal(field.hit(n.x, n.y), n.id);
	assert.equal(field.hit(-5000, -5000), -1);
	const anchor = field.state.nodes.find((x) => x.fixed);
	assert.ok(anchor);
	assert.notEqual(field.hit(anchor.x, anchor.y), anchor.id);
});

test("the entrance starts every node undrawn and holds the webs back", () => {
	const { field } = built();
	field.introBegin();
	assert.equal(field.state.introHold, true);
	for (const n of field.state.nodes) {
		assert.equal(n.penV, 0);
		assert.equal(n.els?.boss.a.pen, 0);
	}
	field.step(0.1);
	assert.ok(field.state.edges.every((e) => e.u === 0 && e.c === 0));
});

test("during the entrance a web is drawn as far as the later of its two nodes", () => {
	const { field } = built();
	field.introBegin();
	const e = field.state.edges.find((x) => x.dir === 1);
	assert.ok(e);
	field.setPen(e.i, 0.8);
	field.setPen(e.j, 0.3);
	field.step(0.05);
	assert.ok(Math.abs(e.u - 0.3) < 1e-9);
	field.setPen(e.j, 1);
	field.step(0.05);
	assert.ok(Math.abs(e.u - 0.8) < 1e-9);
});

test("a node's parts are drawn in turn: outline first, construction last", () => {
	const { field } = built();
	field.introBegin();
	const n = field.state.nodes.find((x) => x.style === "holes" && !x.fixed);
	assert.ok(n?.els);
	field.setPen(n.id, 0.5);
	assert.equal(n.els.boss.a.pen, 1);
	assert.ok(Number(n.els.r1?.a.pen) > 0 && Number(n.els.r1?.a.pen) < 1);
	assert.equal(n.els.cross.a.pen, 0);
});

test("ending the entrance releases the webs and clears every pen", () => {
	const { field } = built();
	field.introBegin();
	field.introEnd();
	assert.equal(field.state.introHold, false);
	for (const n of field.state.nodes) assert.equal(n.els?.boss.a.pen, undefined);
});

test("skipping the entrance shows everything and fades the rest in without removing what is drawn", () => {
	const { field } = built();
	field.advance(8);
	field.introBegin();
	for (const n of field.state.nodes) field.setPen(n.id, n.id % 2 ? 0 : 1);
	field.introFinish();
	assert.equal(field.state.introHold, false);
	const odd = field.state.nodes.find((n) => n.id % 2 === 1);
	const even = field.state.nodes.find((n) => n.id % 2 === 0);
	assert.ok(odd?.ng && even?.ng);
	assert.equal(odd.ng.p.a.fade, 0);
	assert.equal(even.ng.p.a.fade, 1);
	field.setFade(0.5);
	assert.equal(odd.ng.p.a.fade, 0.5);
	field.setFade(1);
	assert.equal(odd.ng.p.a.fade, undefined);
});
