import { expect, test } from "./base";

const widths = [1440, 1280, 768, 390];

for (const width of widths) {
	test(`the hero is centred at ${width} px`, async ({ page }) => {
		await page.setViewportSize({ width, height: width < 800 ? 844 : 800 });
		await page.goto("/");
		const centres = await page.evaluate(() =>
			[".node-logo", ".titleblock h1", ".titleblock .tag", ".pills", ".cue"].map((s) => {
				const r = (document.querySelector(s) as Element).getBoundingClientRect();
				return Math.round((r.left + r.right) / 2);
			}),
		);
		for (const c of centres) expect(Math.abs(c - width / 2)).toBeLessThanOrEqual(1);
		const noScroll = await page.evaluate(
			() => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
		);
		expect(noScroll).toBe(true);
	});
}

test("hero text never gets smaller than 12.5 px", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 600 });
	await page.goto("/");
	const sizes = await page.evaluate(() =>
		[".titleblock .by", ".titleblock .tag", ".pill"].map((s) =>
			parseFloat(getComputedStyle(document.querySelector(s) as Element).fontSize),
		),
	);
	for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12.5);
});

test("the pills point at the download and the web app", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("#dl")).toHaveAttribute("href", /releases\/latest\/download/);
	await expect(page.locator("#web")).toHaveAttribute("href", "https://app.solidcraft.io/");
});
