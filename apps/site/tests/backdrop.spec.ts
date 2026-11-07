import { expect, test } from "@playwright/test";

test("the backdrop is fixed behind the page and ignores the pointer", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/");
	const style = await page.evaluate(() => {
		const b = getComputedStyle(document.querySelector(".backdrop") as Element);
		return { position: b.position, events: b.pointerEvents, z: b.zIndex };
	});
	expect(style).toEqual({ position: "fixed", events: "none", z: "0" });
});

test("the datum tile is a fixed share of the window", async ({ page }) => {
	for (const [w, h] of [
		[1440, 900],
		[390, 844],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await page.goto("/");
		const tile = await page.evaluate(() => {
			const d = getComputedStyle(document.querySelector(".datum") as Element);
			return parseFloat(d.backgroundSize);
		});
		expect(tile).toBeCloseTo(320 * Math.max(w / 2560, h / 1440), 0);
	}
});

test("the page colour shows through at the top of the backdrop", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/");
	const fade = await page.evaluate(() => {
		const a = getComputedStyle(document.querySelector(".backdrop") as Element, "::after");
		return { height: a.height, image: a.backgroundImage.startsWith("linear-gradient") };
	});
	expect(fade.image).toBe(true);
	expect(parseFloat(fade.height)).toBeCloseTo(108, 0);
});
