import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./base";

const pages = [
	{ name: "Features", path: "/features/" },
	{ name: "Plugins", path: "/plugins/" },
	{ name: "Themes", path: "/themes/" },
	{ name: "Showcase", path: "/showcase/" },
];

test.use({ viewport: { width: 1280, height: 800 } });

for (const { name, path } of pages) {
	test(`${name} opens its own page`, async ({ page }) => {
		await page.goto("/");
		await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name }).click();
		await expect(page).toHaveURL(path);
		await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
		await expect(
			page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name }),
		).toHaveAttribute("aria-current", "page");
		await expect(page.locator("footer.foot")).toBeVisible();
	});

	test(`${name} has no accessibility violations and its own metadata`, async ({ page }) => {
		await page.goto(path);
		const results = await new AxeBuilder({ page }).analyze();
		expect(results.violations).toEqual([]);
		await expect(page).toHaveTitle(`${name} — SolidCraft`);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			"href",
			`https://solidcraft.io${path}`,
		);
	});
}

test("Docs leaves the site for the documentation", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Docs" }),
	).toHaveAttribute("href", "https://docs.solidcraft.io/");
});

test("the links on a page belong to that page, whatever the scroll position", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator(".bar nav [aria-current]")).toHaveCount(0);
	await page.evaluate(() => window.scrollTo({ top: 3000, behavior: "instant" }));
	await page.waitForTimeout(300);
	await expect(page.locator(".bar nav [aria-current]")).toHaveCount(0);
});

test("the bar keeps its place while the page scrolls", async ({ page }) => {
	await page.goto("/");
	const before = await page.locator(".bar nav a").first().boundingBox();
	await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" }));
	const after = await page.locator(".bar nav a").first().boundingBox();
	expect(after).toEqual(before);
});

test("the cue scrolls to the first section of the home page", async ({ page }) => {
	await page.goto("/");
	await page.getByRole("link", { name: "Scroll to the next section" }).click();
	await expect(page).toHaveURL(/#agents$/);
});

test("on a phone the pages are reached from the footer", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await page.locator("footer.foot").getByRole("link", { name: "Plugins" }).click();
	await expect(page).toHaveURL("/plugins/");
});

test("a page's bar and logo link back to the home page", async ({ page }) => {
	await page.goto("/themes/");
	await page.getByRole("link", { name: "SolidCraft home" }).click();
	await expect(page).toHaveURL("/");
});
