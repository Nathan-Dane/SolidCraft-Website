import { expect, test } from "@playwright/test";

test("the logo is defined once and drawn from it", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("symbol#brand-logo")).toHaveCount(1);
	const box = await page.locator(".bar .mini svg").boundingBox();
	expect(box?.width).toBeGreaterThan(0);
	const filled = await page.evaluate(() => {
		const use = document.querySelector(".bar .mini svg use");
		const rect = use?.getBoundingClientRect();
		return Boolean(rect && rect.width > 0 && rect.height > 0);
	});
	expect(filled).toBe(true);
});
