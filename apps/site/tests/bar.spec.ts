import { expect, test } from "./base";

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

test("the last glyph in the bar lines up with the page margin", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await page.goto("/");
	const logo = await page.locator(".bar .mini svg").boundingBox();
	const icon = await page.locator(".bar .menu-btn span").boundingBox();
	const gutter = logo?.x ?? 0;
	expect(Math.abs(390 - ((icon?.x ?? 0) + (icon?.width ?? 0)) - gutter)).toBeLessThan(1.5);
});

test("the bar turns solid as the page scrolls", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/");
	await page.addStyleTag({ content: "main { min-height: 400vh; }" });
	const solid = async () => {
		await page.evaluate(
			() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
		);
		return page.evaluate(() =>
			Number(getComputedStyle(document.querySelector(".bar") as Element, "::before").opacity),
		);
	};
	expect(await solid()).toBe(0);
	await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
	expect(await solid()).toBe(0);
	await page.evaluate(() => window.scrollTo({ top: 1000, behavior: "instant" }));
	expect(await solid()).toBeCloseTo(1, 1);
});

test.describe("the menu", () => {
	test.use({ viewport: { width: 700, height: 800 } });

	test("opens from the button, lists the pages and closes again", async ({ page }) => {
		await page.goto("/features/");
		const button = page.getByRole("button", { name: "Menu" });
		const menu = page.locator("#menu");
		await expect(menu).toBeHidden();
		await button.click();
		await expect(button).toHaveAttribute("aria-expanded", "true");
		await expect(menu.getByRole("link")).toHaveCount(5);
		await expect(menu.locator('a[aria-current="page"]')).toHaveText("Features");
		await page.keyboard.press("Escape");
		await expect(menu).toBeHidden();
		await expect(button).toBeFocused();
		await button.click();
		await page.mouse.click(300, 600);
		await expect(menu).toBeHidden();
	});

	test("a link goes to its page", async ({ page }) => {
		await page.goto("/");
		await page.getByRole("button", { name: "Menu" }).click();
		await page.locator("#menu").getByRole("link", { name: "Plugins" }).click();
		await expect(page).toHaveURL(/\/plugins\/?$/);
		await expect(page.locator("#menu")).toBeHidden();
	});

	test("the button is not there on a wide window", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 800 });
		await page.goto("/");
		await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
	});
});
