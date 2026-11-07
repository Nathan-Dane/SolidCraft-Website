import { expect, type Page, test } from "./base";

test.skip(({ isMobile }) => isMobile, "the probes run at desktop size");
test.use({ viewport: { width: 1440, height: 900 } });

/** Counts the animation frames the page asks for. */
async function countFrames(page: Page) {
	await page.addInitScript(() => {
		const w = window as unknown as { frames: number };
		w.frames = 0;
		const original = window.requestAnimationFrame.bind(window);
		window.requestAnimationFrame = (cb) => {
			w.frames++;
			return original(cb);
		};
	});
}
const frames = (page: Page) =>
	page.evaluate(() => (window as unknown as { frames: number }).frames);

async function framesOver(page: Page, ms: number) {
	const before = await frames(page);
	await page.waitForTimeout(ms);
	return ((await frames(page)) - before) / (ms / 1000);
}

test("with the hero away and the pointer still, the page asks for no frames", async ({ page }) => {
	await countFrames(page);
	await page.goto("/?gl=software&debug");
	await page.waitForFunction(() => (window as unknown as { fieldHost?: unknown }).fieldHost);
	await page.evaluate(() => window.scrollTo(0, innerHeight * 2));
	await expect(page.locator(".backdrop")).toHaveClass(/\bparked\b/);
	await page.waitForTimeout(1500); // the scrolling hold and the cursor's settling
	expect(await framesOver(page, 1500)).toBe(0);
});

test("a page without a field and a still pointer asks for no frames", async ({ page }) => {
	await countFrames(page);
	await page.goto("/features/");
	await page.waitForFunction(() => document.documentElement.classList.contains("has-cursor"));
	await page.mouse.move(400, 400, { steps: 6 });
	await page.waitForTimeout(1500);
	expect(await framesOver(page, 1500)).toBe(0);
});

test("the live field in view stays within the display rate", async ({ page }) => {
	await countFrames(page);
	await page.goto("/?gl=software&debug");
	await page.waitForFunction(() => (window as unknown as { fieldHost?: unknown }).fieldHost);
	await page.waitForTimeout(1000);
	expect(await framesOver(page, 2000)).toBeLessThanOrEqual(75);
});

test("the field's simulation runs at the idle rate, not the display rate", async ({ page }) => {
	await page.goto("/?gl=software&debug");
	await page.waitForFunction(() => (window as unknown as { fieldHost?: unknown }).fieldHost);
	await page.waitForTimeout(1500);
	const steps = await page.evaluate(async () => {
		const host = (window as unknown as { fieldHost: { field: { state: { t: number } } } })
			.fieldHost;
		const t0 = host.field.state.t;
		await new Promise((r) => setTimeout(r, 2000));
		return host.field.state.t - t0;
	});
	// simulated seconds per real second stays at about one: it is the step rate that is lowered, not the speed
	expect(steps).toBeGreaterThan(1);
	expect(steps).toBeLessThan(3);
});
