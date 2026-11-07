import { expect, test } from "./base";

for (const width of [390, 768]) {
	test.describe(`at ${width} px`, () => {
		test.use({ viewport: { width, height: 844 } });

		test("nothing scrolls sideways", async ({ page }) => {
			await page.goto("/");
			const wide = await page.evaluate(
				() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
			);
			expect(wide).toBe(false);
		});

		test("the links under the sections are centred", async ({ page }) => {
			await page.goto("/");
			const centres = await page.$$eval(".more-link", (links) =>
				links.map((l) => {
					const r = l.getBoundingClientRect();
					return Math.round((r.left + r.right) / 2);
				}),
			);
			expect(centres.length).toBeGreaterThan(0);
			for (const c of centres) expect(Math.abs(c - width / 2)).toBeLessThanOrEqual(1);
		});

		test("every row of buttons is centred", async ({ page }) => {
			await page.goto("/");
			const offsets = await page.$$eval(".sec .actions", (rows) =>
				rows.flatMap((row) => {
					const lines = new Map<number, DOMRect[]>();
					for (const b of row.children) {
						const r = b.getBoundingClientRect();
						const key = Math.round(r.top);
						lines.set(key, [...(lines.get(key) ?? []), r]);
					}
					return [...lines.values()].map((rects) => {
						const left = Math.min(...rects.map((r) => r.left));
						const right = Math.max(...rects.map((r) => r.right));
						return Math.round((left + right) / 2 - document.documentElement.clientWidth / 2);
					});
				}),
			);
			expect(offsets.length).toBeGreaterThan(0);
			for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(1);
		});

		test("the hero pills are centred with their contents", async ({ page }) => {
			await page.goto("/");
			const offsets = await page.$$eval(".pill", (pills) =>
				pills.map((p) => {
					const range = document.createRange();
					range.selectNodeContents(p);
					const c = range.getBoundingClientRect();
					const r = p.getBoundingClientRect();
					return Math.round((c.left + c.right) / 2 - (r.left + r.right) / 2);
				}),
			);
			for (const o of offsets) expect(Math.abs(o)).toBeLessThanOrEqual(1);
		});
	});
}
