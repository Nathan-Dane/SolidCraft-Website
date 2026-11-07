import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLean } from "./registry.ts";

test("the lean is read from a translate style", () => {
	assert.deepEqual(parseLean("1.25px -3.5px"), [1.25, -3.5]);
	assert.deepEqual(parseLean("4px"), [4, 0]);
	assert.deepEqual(parseLean(""), [0, 0]);
});
