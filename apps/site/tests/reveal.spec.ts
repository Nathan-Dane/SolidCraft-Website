import { expect, test } from "./base";

const opacity = (page: import("@playwright/test").Page, selector: string) =>
	page.evaluate(
		(s) => Number(getComputedStyle(document.querySelector(s) as Element).opacity),
		selector,
	);

test("blocks below the fold are hidden until they enter the view, then stay", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/");
	expect(await opacity(page, "#showcase h2")).toBe(0);
	await page.locator("#showcase h2").scrollIntoViewIfNeeded();
	await expect(page.locator("#showcase h2")).toHaveClass(/\bin\b/);
	await page.waitForTimeout(900);
	expect(await opacity(page, "#showcase h2")).toBe(1);
	await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
	await page.waitForTimeout(300);
	expect(await opacity(page, "#showcase h2")).toBe(1);
});

test("blocks of a section follow one another by a short stagger", async ({ page }) => {
	await page.goto("/");
	const delays = await page.$$eval("#agents .rv", (els) =>
		els.map((e) => (e as HTMLElement).style.getPropertyValue("--d")),
	);
	expect(delays).toEqual(["0ms", "80ms", "160ms", "240ms", "320ms"]);
});

test("with reduced motion everything is shown at once", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/");
	expect(await opacity(page, "#get h2")).toBe(1);
});
