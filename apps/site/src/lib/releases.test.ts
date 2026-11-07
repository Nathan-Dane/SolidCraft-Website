import assert from "node:assert/strict";
import { test } from "node:test";
import { current, linkFor, pick, type Release, slim, versionLine } from "./releases.ts";

const rel = (tag: string, over: Partial<Release> = {}): Release => ({
	tag_name: tag,
	html_url: `https://github.com/tangency-labs/solidcraft/releases/tag/${tag}`,
	prerelease: false,
	draft: false,
	assets: [],
	...over,
});

test("an unknown stable release links to the latest download", () => {
	assert.equal(
		linkFor(null, "macos"),
		"https://github.com/tangency-labs/solidcraft/releases/latest/download/solidcraft-macos-universal.dmg",
	);
	assert.equal(
		linkFor(null, "freebsd"),
		"https://github.com/tangency-labs/solidcraft/releases/latest",
	);
});

test("a known release links to its own installers", () => {
	assert.equal(
		linkFor(rel("v0.30.1"), "windows"),
		"https://github.com/tangency-labs/solidcraft/releases/download/v0.30.1/solidcraft-windows-x64.msi",
	);
});

test("FreeBSD uses the asset list and falls back to the release page", () => {
	const asset = {
		name: "solidcraft-0.30.1-freebsd-x86_64.tar.gz",
		browser_download_url: "https://example.test/bsd.tgz",
	};
	assert.equal(linkFor(rel("v1", { assets: [asset] }), "freebsd"), asset.browser_download_url);
	assert.equal(linkFor(rel("v1"), "freebsd"), rel("v1").html_url);
});

test("a pre-release channel with nothing known links to the releases page", () => {
	assert.equal(linkFor(false, "linux"), "https://github.com/tangency-labs/solidcraft/releases");
});

test("pick finds the newest stable and the newest pre-release, never a draft", () => {
	const list = [rel("d", { draft: true }), rel("rc", { prerelease: true }), rel("s1"), rel("s0")];
	const known = pick(list);
	assert.equal(known.stable?.tag_name, "s1");
	assert.equal(known.pre?.tag_name, "rc");
});

test("the version line follows the channel", () => {
	const known = pick([rel("v0.31.0-rc1", { prerelease: true }), rel("v0.30.1")]);
	assert.equal(versionLine("stable", current("stable", known)).text, "v0.30.1 available");
	assert.equal(versionLine("pre", current("pre", known)).text, "v0.31.0-rc1 pre-release");
	assert.equal(versionLine("stable", null).text, "latest release");
	assert.equal(versionLine("pre", false).text, "pre-releases on GitHub");
});

test("slim keeps only FreeBSD assets", () => {
	const r = rel("v1", {
		assets: [
			{ name: "solidcraft-windows-x64.msi", browser_download_url: "a" },
			{ name: "x-freebsd-x86_64.tar.gz", browser_download_url: "b" },
		],
	});
	assert.deepEqual(slim([r])[0]?.assets, [
		{ name: "x-freebsd-x86_64.tar.gz", browser_download_url: "b" },
	]);
});
