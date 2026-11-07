import { expect, test } from "./base";

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

test("the page has a social preview image that exists", async ({ page, request }) => {
	await page.goto("/features/");
	const image = await page.locator('meta[property="og:image"]').getAttribute("content");
	expect(image).toBe("https://solidcraft.io/og.png");
	await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
		"content",
		"summary_large_image",
	);
	const res = await request.get("/og.png");
	expect(res.ok()).toBe(true);
	expect(res.headers()["content-type"]).toContain("image/png");
});
