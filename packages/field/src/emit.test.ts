import assert from "node:assert/strict";
import { test } from "node:test";
import { atlasLayout } from "./atlas.ts";
import { applyTransform, colour, createEmitter, STRIDE } from "./emit.ts";
import { VEl } from "./scene.ts";

const emitter = createEmitter(atlasLayout(["7", "."]));
const near = (a: number | undefined, b: number, eps = 1e-5) =>
	Math.abs((a ?? Number.NaN) - b) <= eps;

function root(...kids: VEl[]): VEl {
	const g = new VEl("g");
	for (const k of kids) g.appendChild(k);
	return g;
}

const stroke = (d: string, extra: Record<string, string | number> = {}) =>
	new VEl("path", { d, stroke: "#336699", "stroke-width": 2, ...extra });

test("colours read from hex and rgb()", () => {
	assert.deepEqual(colour("#ff0000"), [1, 0, 0]);
	assert.deepEqual(colour("rgb(0, 255, 0)"), [0, 1, 0]);
	assert.deepEqual(colour("nonsense"), [1, 1, 1]);
});

test("transforms compose in order: translate, rotate in degrees, scale", () => {
	const M = applyTransform([1, 0, 0, 1, 0, 0], "translate(10 20) rotate(90) scale(2)");
	assert.ok(near(M[0], 0) && near(M[1], 2) && near(M[2], -2) && near(M[3], 0));
	assert.ok(near(M[4], 10) && near(M[5], 20));
	assert.deepEqual(
		applyTransform([1, 0, 0, 1, 0, 0], "scale(0.018 -0.018)"),
		[0.018, 0, 0, -0.018, 0, 0],
	);
});

test("a line is one instance holding its ends, width, alpha and colour", () => {
	const out = emitter.emit([root(stroke("M0 0L100 0"))], 1);
	assert.equal(out.nInst, 1);
	const f = out.inst;
	assert.deepEqual([f[0], f[1], f[2], f[3]], [0, 0, 100, 0]);
	assert.equal(f[8], 0); // a straight segment
	assert.equal(f[10], 2);
	assert.equal(f[11], 1);
	assert.ok(near(f[12], 0x33 / 255) && near(f[14], 0x99 / 255));
	assert.equal(f[22], 0); // not cut: drawn whole
	assert.equal(f[21], 100);
});

test("a long line is cut into chunks and a circle into arcs", () => {
	assert.equal(emitter.emit([root(stroke("M0 0L500 0"))], 1).nInst, 4);
	const circle = new VEl("circle", { cx: 0, cy: 0, r: 50, stroke: "#336699", "stroke-width": 1 });
	const out = emitter.emit([root(circle)], 1);
	assert.equal(out.nInst, 8);
	assert.equal(out.inst[8], 1); // an arc
});

test("round caps are flagged on the ends of an open stroke only", () => {
	const out = emitter.emit([root(stroke("M0 0L10 0L10 10", { "stroke-linecap": "round" }))], 1);
	assert.equal(out.nInst, 2);
	assert.equal(out.inst[15], 1 + 4);
	assert.equal(out.inst[STRIDE + 15], 2 + 4);
});

test("opacity and fade multiply down the tree, and hidden things are not drawn", () => {
	const inner = stroke("M0 0L10 0", { opacity: 0.5 });
	const g = new VEl("g", { opacity: 0.5 });
	g.appendChild(inner);
	const faded = stroke("M0 5L10 5", { fade: 0.4 });
	const hidden = stroke("M0 9L10 9");
	hidden.style.display = "none";
	const invisible = stroke("M0 11L10 11", { visibility: "hidden" });
	const out = emitter.emit([root(g, faded, hidden, invisible)], 1);
	assert.equal(out.nInst, 2);
	assert.equal(out.inst[11], 0.25);
	assert.ok(near(out.inst[STRIDE + 11], 0.4));
});

test("a group's transform moves what it holds", () => {
	const g = new VEl("g", { transform: "translate(5 7)" });
	g.appendChild(stroke("M0 0L10 0"));
	const out = emitter.emit([root(g)], 1);
	assert.deepEqual([out.inst[0], out.inst[1], out.inst[2], out.inst[3]], [5, 7, 15, 7]);
});

test("dashes scale with the transform and a dash offset is carried into the instance", () => {
	const g = new VEl("g", { transform: "scale(2)" });
	g.appendChild(stroke("M0 0L10 0", { "stroke-dasharray": "4 2 1 2", "stroke-dashoffset": 3 }));
	const out = emitter.emit([root(g)], 1);
	assert.deepEqual([out.inst[16], out.inst[17], out.inst[18], out.inst[19]], [8, 4, 2, 4]);
	assert.equal(out.inst[20], 6);
});

test("a path with pathLength has its dash lengths as fractions of the path", () => {
	const out = emitter.emit(
		[root(stroke("M0 0L200 0", { pathLength: 1, "stroke-dasharray": "0.25 2" }))],
		1,
	);
	assert.equal(out.inst[16], 50);
	assert.equal(out.inst[17], 400);
	assert.equal(out.inst[18], 0);
});

test("the pen cuts a stroke at a fraction of its length; zero draws nothing and one draws it whole", () => {
	const make = (pen: number) => root(stroke("M0 0L100 0", { pen }));
	assert.equal(emitter.emit([make(0)], 1).nInst, 0);
	assert.ok(near(emitter.emit([make(0.4)], 1).inst[22], 40));
	assert.equal(emitter.emit([make(1)], 1).inst[22], 0);
});

test("the pen of a parent limits its children", () => {
	const g = new VEl("g", { pen: 0.5 });
	g.appendChild(stroke("M0 0L100 0", { pen: 0.9 }));
	assert.ok(near(emitter.emit([root(g)], 1).inst[22], 50));
});

test("a glyph is two triangles, and fades in during the last quarter of the pen (before it, it is transparent)", () => {
	const label = (pen: number) => {
		const g = new VEl("g", { fill: "#ffffff", pen });
		g.appendChild(new VEl("use", { href: "#g7", x: 0 }));
		return root(g);
	};
	const full = emitter.emit([label(1)], 1);
	assert.equal(full.nFill, 6);
	assert.equal(full.fill[7], 1);
	assert.equal(emitter.emit([label(0.7)], 1).fill[7], 0);
	assert.ok(near(emitter.emit([label(0.875)], 1).fill[7], 0.5));
	assert.equal(emitter.emit([new VEl("use", { href: "#nope" })], 1).nFill, 0);
});

test("a filled closed path is triangulated as a fan over its points, closing point included", () => {
	const square = new VEl("path", { d: "M0 0L10 0L10 10L0 10Z", fill: "#112233", stroke: "none" });
	const out = emitter.emit([root(square)], 1);
	assert.equal(out.nFill, 9);
	assert.equal(out.nInst, 0);
});
