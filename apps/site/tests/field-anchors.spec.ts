import { expect, test } from "@playwright/test";

test("the hero marks the logo and the two pills as nodes of the field and its text as quiet", async ({
	page,
}) => {
	await page.goto("/");
	await expect(page.locator('[data-field-anchor="logo"]')).toHaveCount(1);
	await expect(page.locator('[data-field-anchor="pill"]')).toHaveText([
		"Download for macOS",
		"Try in browser",
	]);
	await expect(page.locator("[data-quiet]")).toHaveCount(2);
});
