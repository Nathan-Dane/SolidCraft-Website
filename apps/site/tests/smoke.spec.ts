import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./base";

test("the home page loads", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveTitle(/^SolidCraft/);
});

test("the home page has no accessibility violations", async ({ page }) => {
	await page.goto("/");
	const results = await new AxeBuilder({ page }).analyze();
	expect(results.violations).toEqual([]);
});
