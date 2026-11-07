import assert from "node:assert/strict";
import { test } from "node:test";
import { ATLAS_H, ATLAS_W, atlasLayout } from "./atlas.ts";
import { GLYPHS } from "./glyphs.ts";

test("every glyph has a cell of its own inside the atlas", () => {
	const layout = atlasLayout(Object.keys(GLYPHS));
	assert.equal(layout.cells.length, Object.keys(GLYPHS).length);
	const seen = new Set<string>();
	for (const c of layout.cells) {
		const key = `${c.ox},${c.oy}`;
		assert.equal(seen.has(key), false);
		seen.add(key);
	}
	for (const [u0, v0, u1, v1] of Object.values(layout.uv)) {
		assert.ok(u0 >= 0 && v0 >= 0 && u1 <= 1 && v1 <= 1);
		assert.ok(u1 > u0 && v1 > v0);
	}
});

test("glyph ids follow the scene's naming and the solid texel is in the corner", () => {
	const layout = atlasLayout(["7", ".", "Ø"]);
	assert.deepEqual(Object.keys(layout.uv), ["g7", "gdot", "gO"]);
	assert.ok(layout.solid[0] * ATLAS_W > ATLAS_W - 8 && layout.solid[1] * ATLAS_H > ATLAS_H - 8);
});
