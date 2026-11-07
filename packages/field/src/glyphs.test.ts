import assert from "node:assert/strict";
import { test } from "node:test";
import { ADVANCE, GLYPHS } from "./glyphs.ts";

test("every character a dimension label uses has an outline", () => {
	for (const ch of "0123456789.°RØL-") {
		const d = GLYPHS[ch];
		assert.ok(d, `missing ${ch}`);
		assert.match(d, /^M/);
		assert.match(d, /Z$/);
	}
});

test("the glyphs are monospaced", () => {
	assert.equal(ADVANCE, 600);
});
