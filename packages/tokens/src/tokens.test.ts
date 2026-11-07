import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tokenNames } from "./index.ts";

const here = new URL(".", import.meta.url).pathname;
const css = readFileSync(join(here, "tokens.css"), "utf8");
const siteSrc = join(here, "../../../apps/site/src");

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
	);
}

function declared(text: string): Set<string> {
	return new Set([...text.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] as string));
}

test("the typed list matches the stylesheet", () => {
	assert.deepEqual([...declared(css)].sort(), [...tokenNames].sort());
});

test("every custom property the site uses is declared", () => {
	const files = walk(siteSrc).filter((f) => /\.(css|astro)$/.test(f));
	const texts = files.map((f) => readFileSync(f, "utf8"));
	const known = declared([css, ...texts].join("\n"));
	const missing: string[] = [];
	for (const [i, text] of texts.entries()) {
		for (const m of text.matchAll(/var\((--[a-z0-9-]+)/g)) {
			if (!known.has(m[1] as string)) missing.push(`${files[i]}: ${m[1]}`);
		}
	}
	assert.deepEqual(missing, []);
});
