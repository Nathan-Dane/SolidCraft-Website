import { expect, test } from "./base";

test("the footer lists three columns and the independence line", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/");
	const foot = page.locator("footer.foot");
	await expect(foot.locator("h2")).toHaveText(["Product", "Learn & build", "Project"]);
	await expect(foot.locator(".indep")).toContainText(
		"Autodesk and NVIDIA do not endorse these projects",
	);
	const rows = await foot
		.locator(".cols > div")
		.evaluateAll(
			(cols) => new Set(cols.map((c) => Math.round(c.getBoundingClientRect().top))).size,
		);
	expect(rows).toBe(1);
});

test("the footer columns pair up on a phone", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await page.goto("/");
	const rows = await page
		.locator("footer.foot .cols > div")
		.evaluateAll(
			(cols) => new Set(cols.map((c) => Math.round(c.getBoundingClientRect().top))).size,
		);
	expect(rows).toBe(2);
});
