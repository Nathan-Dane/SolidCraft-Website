import { expect, test } from "@playwright/test";

test("the page has its metadata", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator('meta[name="description"]')).toHaveAttribute(
		"content",
		/parametric CAD/,
	);
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#10243a");
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		"https://solidcraft.io/",
	);
	const ld = await page.locator('script[type="application/ld+json"]').textContent();
	expect(JSON.parse(ld ?? "{}").name).toBe("SolidCraft");
});

test("the skip link is the first stop and reaches the main content", async ({ page }) => {
	await page.goto("/");
	await page.keyboard.press("Tab");
	const skip = page.getByRole("link", { name: "Skip to content" });
	await expect(skip).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page).toHaveURL(/#main$/);
});
