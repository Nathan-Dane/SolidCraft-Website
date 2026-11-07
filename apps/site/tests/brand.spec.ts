import { expect, test } from "./base";

test("the logo is defined once and drawn from it", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator("symbol#brand-logo")).toHaveCount(1);
	const box = await page.locator(".bar .mini svg").boundingBox();
	expect(box?.width).toBeGreaterThan(0);
	const filled = await page.evaluate(() => {
		const use = document.querySelector(".bar .mini svg use");
		const rect = use?.getBoundingClientRect();
		return Boolean(rect && rect.width > 0 && rect.height > 0);
	});
	expect(filled).toBe(true);
});

for (const selector of [".bar .mini svg", ".node-logo svg"]) {
	test(`the logo in ${selector} is drawn whole, not cropped`, async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		const png = await page.locator(selector).screenshot();
		const spread = await page.evaluate(async (b64) => {
			const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
			const bmp = await createImageBitmap(blob);
			const canvas = document.createElement("canvas");
			canvas.width = bmp.width;
			canvas.height = bmp.height;
			const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
			ctx.drawImage(bmp, 0, 0);
			const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
			let [minX, minY, maxX, maxY] = [width, height, -1, -1];
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					if ((data[(y * width + x) * 4 + 2] ?? 0) > 150) {
						minX = Math.min(minX, x);
						maxX = Math.max(maxX, x);
						minY = Math.min(minY, y);
						maxY = Math.max(maxY, y);
					}
				}
			}
			return {
				left: minX / width,
				right: (maxX + 1) / width,
				top: minY / height,
				bottom: (maxY + 1) / height,
			};
		}, png.toString("base64"));
		// the artwork fills its box to within two pixels on every side
		for (const gap of Object.values(spread)) expect(gap).toBeLessThanOrEqual(2);
	});
}
