import { expect, test } from "./base";

const anchors = ["agents", "modular", "panels", "themes", "kernel", "showcase", "open", "get"];

test("the eight sections follow the hero in order", async ({ page }) => {
	await page.goto("/");
	const ids = await page.$$eval("main > section", (nodes) => nodes.map((n) => n.id));
	expect(ids).toEqual(["top", ...anchors]);
});

test("each section has a heading and the numbered eyebrows run in order", async ({ page }) => {
	await page.goto("/");
	for (const id of anchors) {
		await expect(page.locator(`#${id} h2`)).toHaveCount(1);
	}
	const eyebrows = await page.$$eval(".eyebrow", (nodes) =>
		nodes.map((n) => n.textContent?.slice(0, 2)),
	);
	expect(eyebrows).toEqual(["01", "02", "03", "04", "05", "06", "07"]);
});

test("every demo stage is a placeholder with a kind", async ({ page }) => {
	await page.goto("/");
	const kinds = await page.$$eval(".stage", (nodes) =>
		nodes.map((n) => n.getAttribute("data-stage")),
	);
	expect(kinds).toEqual(["agents", "modular", "panels", "themes", "kernel"]);
});

test("the sections have no accessibility violations", async ({ page }) => {
	const { default: AxeBuilder } = await import("@axe-core/playwright");
	await page.goto("/");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
