import { expect, test } from "@playwright/test";

test("the bar has the five links and two icons", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/");
	const nav = page.getByRole("navigation", { name: "Primary" });
	await expect(nav.getByRole("link")).toHaveText([
		"Features",
		"Plugins",
		"Themes",
		"Docs",
		"Showcase",
	]);
	await expect(page.getByRole("link", { name: "SolidCraft on GitHub" })).toBeVisible();
	await expect(page.getByRole("link", { name: "SolidCraft on Discord" })).toBeVisible();
});

test("the links are hidden below 1000 px and the icons stay", async ({ page }) => {
	await page.setViewportSize({ width: 999, height: 800 });
	await page.goto("/");
	await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
	await expect(page.getByRole("link", { name: "SolidCraft on GitHub" })).toBeVisible();
});

test("the icons line up with the page margin", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await page.goto("/");
	const logo = await page.locator(".bar .mini svg").boundingBox();
	const icon = await page.locator(".bar .ico svg").last().boundingBox();
	const gutter = logo?.x ?? 0;
	expect(Math.abs(390 - ((icon?.x ?? 0) + (icon?.width ?? 0)) - gutter)).toBeLessThan(1.5);
});
