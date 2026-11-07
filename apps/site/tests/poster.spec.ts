import { expect, test } from "@playwright/test";

test("without scripts the static drawing fills the backdrop", async ({ browser }) => {
	const context = await browser.newContext({
		javaScriptEnabled: false,
		viewport: { width: 1280, height: 800 },
	});
	const page = await context.newPage();
	await page.goto("/");
	const img = page.locator(".poster img");
	await expect(img).toBeVisible();
	const ok = await img.evaluate(
		(el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
	);
	expect(ok).toBe(true);
	const box = await img.boundingBox();
	expect(box?.width).toBe(1280);
	await context.close();
});

test("with scripts the drawing is neither shown nor fetched", async ({ page }) => {
	const requested: string[] = [];
	page.on("request", (r) => requested.push(r.url()));
	await page.goto("/");
	await page.waitForTimeout(500);
	await expect(page.locator(".poster")).toBeHidden();
	expect(requested.filter((u) => u.endsWith("poster.svg"))).toEqual([]);
});
