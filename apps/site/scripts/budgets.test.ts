import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { overBudget } from "./budgets.ts";

const list = [{ pattern: /\.js$/, label: "JavaScript", maxGzipBytes: 100 }];

test("a file under its budget passes", () => {
	const files = [{ file: "a.js", data: new TextEncoder().encode("const a = 1;") }];
	assert.deepEqual(overBudget(files, list), []);
});

test("a file over its budget is reported", () => {
	const files = [{ file: "big.js", data: randomBytes(4096) }];
	const [finding] = overBudget(files, list);
	assert.equal(finding?.file, "big.js");
	assert.equal(finding?.label, "JavaScript");
});

test("files without a budget are ignored", () => {
	const files = [{ file: "photo.avif", data: randomBytes(4096) }];
	assert.deepEqual(overBudget(files, list), []);
});
