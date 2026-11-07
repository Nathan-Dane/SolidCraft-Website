import assert from "node:assert/strict";
import { test } from "node:test";
import { COL, mix } from "./palette.ts";

test("mixing nothing gives the colour itself and mixing fully gives the hot colour", () => {
	assert.equal(mix("outline", 0), "rgb(100,170,211)");
	assert.equal(mix("outline", 1), "rgb(223,244,255)");
});

test("a half mix is between the two", () => {
	assert.equal(mix("ring", 0.5), "rgb(146,190,216)");
	assert.ok(COL.hot.startsWith("#"));
});
