import { expect, type Page, test } from "@playwright/test";

// Chromium supports scroll-driven animations; pretend it does not, so the page runs the scheduler path
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const supports = CSS.supports.bind(CSS);
		CSS.supports = (...args: [string] | [string, string]) =>
			String(args[0]).includes("animation-timeline") ? false : supports(...(args as [string]));
	});
	await page.setViewportSize({ width: 1440, height: 900 });
});

const frames = (page: Page) =>
	page.evaluate(
		() =>
			new Promise((r) =>
				requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))),
			),
	);

test("the page switches to the scheduler path", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("html")).toHaveClass(/scroll-js/);
});

test("the bar turns solid between 55% and 70% of the window", async ({ page }) => {
	await page.goto("/");
	const solid = async () =>
		Number(
			await page.evaluate(
				() => getComputedStyle(document.querySelector(".bar") as Element, "::before").opacity,
			),
		);
	expect(await solid()).toBe(0);
	await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
	await frames(page);
	expect(await solid()).toBe(0);
	await page.evaluate(() => window.scrollTo({ top: 500, behavior: "instant" }));
	await frames(page);
	expect(await solid()).toBeCloseTo((500 - 495) / 135, 1);
	await page.evaluate(() => window.scrollTo({ top: 1500, behavior: "instant" }));
	await frames(page);
	expect(await solid()).toBe(1);
});

test("the datum sheet moves at 12% of the scroll and wraps by whole tiles", async ({ page }) => {
	await page.goto("/");
	const tile = 320 * Math.max(1440 / 2560, 900 / 1440);
	for (const y of [0, 300, 777, 1500, 2500, 3600]) {
		await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
		await frames(page);
		const ty = await page.evaluate(() => {
			const m = getComputedStyle(document.querySelector(".datum") as Element).transform;
			return m === "none" ? 0 : new DOMMatrix(m).f;
		});
		expect(Math.abs(ty - -((0.12 * y) % tile))).toBeLessThan(1.5);
	}
});

test("the loop sleeps when the page is still", async ({ page }) => {
	await page.goto("/");
	await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
	await page.waitForTimeout(1000);
	const requested = await page.evaluate(
		() =>
			new Promise<string[]>((resolve) => {
				const stacks: string[] = [];
				const original = window.requestAnimationFrame.bind(window);
				window.requestAnimationFrame = (cb) => {
					stacks.push(String(new Error().stack));
					return original(cb);
				};
				setTimeout(() => resolve(stacks), 500);
			}),
	);
	expect(requested, requested.join("\n---\n")).toEqual([]);
});
