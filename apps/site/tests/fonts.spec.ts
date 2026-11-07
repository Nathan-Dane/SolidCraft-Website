import { expect, test } from "@playwright/test";

test("the three preloaded fonts are served", async ({ page, request }) => {
	await page.goto("/");
	const urls = await page.$$eval('link[rel="preload"][as="font"]', (links) =>
		links.map((l) => (l as HTMLLinkElement).href),
	);
	expect(urls).toHaveLength(3);
	for (const url of urls) {
		const res = await request.get(url);
		expect(res.status()).toBe(200);
		expect(res.headers()["content-type"]).toContain("font/woff2");
	}
});

test("the page does not shift while fonts load", async ({ page }) => {
	await page.addInitScript(() => {
		const w = window as unknown as { shift: number };
		w.shift = 0;
		new PerformanceObserver((list) => {
			for (const e of list.getEntries()) {
				const s = e as PerformanceEntry & { value: number; hadRecentInput: boolean };
				if (!s.hadRecentInput) w.shift += s.value;
			}
		}).observe({ type: "layout-shift", buffered: true });
	});
	await page.goto("/");
	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(300);
	expect(await page.evaluate(() => (window as unknown as { shift: number }).shift)).toBe(0);
});
