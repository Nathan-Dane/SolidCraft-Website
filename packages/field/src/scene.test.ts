import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { glyphId, scene, VEl } from "./scene.ts";

beforeEach(() => {
	scene.dirty = false;
});

test("changing an attribute marks the scene dirty, setting the same value does not", () => {
	const el = new VEl("path", { d: "M0 0" });
	scene.dirty = false;
	el.setAttribute("d", "M0 0");
	assert.equal(scene.dirty, false);
	el.setAttribute("d", "M1 1");
	assert.equal(scene.dirty, true);
	assert.equal(el.a.d, "M1 1");
});

test("children know their parent and can remove themselves", () => {
	const g = new VEl("g");
	const c = g.appendChild(new VEl("circle", { r: 4 }));
	assert.equal(c.parent, g);
	assert.deepEqual(g.kids, [c]);
	scene.dirty = false;
	c.remove();
	assert.equal(c.parent, null);
	assert.deepEqual(g.kids, []);
	assert.equal(scene.dirty, true);
});

test("display none hides an element and only a change marks the scene dirty", () => {
	const el = new VEl("path");
	scene.dirty = false;
	el.style.display = "";
	assert.equal(scene.dirty, false);
	el.style.display = "none";
	assert.equal(el.hide, true);
	assert.equal(scene.dirty, true);
	el.style.display = "";
	assert.equal(el.hide, false);
});

test("clearing a group drops its children", () => {
	const g = new VEl("g");
	g.appendChild(new VEl("path"));
	g.clear();
	assert.equal(g.kids.length, 0);
});

test("label characters map to glyph ids", () => {
	assert.equal(glyphId("7"), "g7");
	assert.equal(glyphId("."), "gdot");
	assert.equal(glyphId("°"), "gdeg");
	assert.equal(glyphId("R"), "gR");
	assert.equal(glyphId("Ø"), "gO");
	assert.equal(glyphId("-"), "gm");
});
