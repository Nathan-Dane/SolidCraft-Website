import { expect, test } from "@playwright/test";

const links = [
	{ name: "Features", id: "agents" },
	{ name: "Plugins", id: "modular" },
	{ name: "Themes", id: "themes" },
	{ name: "Showcase", id: "showcase" },
];

for (const { name, id } of links) {
	test(`${name} scrolls to its section below the bar`, async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 800 });
		await page.goto("/");
		await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name }).click();
		await expect(page).toHaveURL(new RegExp(`#${id}$`));
		await expect
			.poll(
				async () =>
					page.evaluate(
						(i) => Math.round((document.getElementById(i) as Element).getBoundingClientRect().top),
						id,
					),
				{
					timeout: 4000,
				},
			)
			.toBe(84);
	});
}

test("Docs leaves the page for the documentation", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/");
	await expect(
		page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Docs" }),
	).toHaveAttribute("href", "https://docs.solidcraft.io/");
});

test("the cue scrolls to the first section", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/");
	await page.getByRole("link", { name: "Scroll to the next section" }).click();
	await expect(page).toHaveURL(/#agents$/);
});

test("the links do not follow the scroll position", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/#themes");
	await page.waitForTimeout(800);
	await expect(page.locator(".bar nav [aria-current]")).toHaveCount(0);
});

test("the bar keeps its place while the page scrolls", async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 800 });
	await page.goto("/");
	const before = await page.locator(".bar nav a").first().boundingBox();
	await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" }));
	const after = await page.locator(".bar nav a").first().boundingBox();
	expect(after).toEqual(before);
});
