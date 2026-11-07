import { expect, test } from "./base";

test.skip(({ isMobile }) => isMobile, "touch screens have no cursor");
test.use({ viewport: { width: 1440, height: 900 } });

async function atLink(page: import("@playwright/test").Page) {
	await page.goto("/");
	await page.waitForFunction(() => document.documentElement.classList.contains("has-cursor"));
	const link = page.locator("#agents .more-link");
	await link.scrollIntoViewIfNeeded();
	await page.waitForTimeout(1200); // the section has risen into place
	return link;
}

test("a section link leans with the cursor at once, with no transition holding it back", async ({
	page,
}) => {
	const link = await atLink(page);
	const box = await link.boundingBox();
	if (!box) throw new Error("no link");
	await page.mouse.move(box.x + box.width - 6, box.y + box.height / 2, { steps: 8 });
	await page.waitForTimeout(700);
	const { inline, computed } = await link.evaluate((e) => ({
		inline: (e as HTMLElement).style.translate,
		computed: getComputedStyle(e).translate,
	}));
	expect(inline).not.toBe("");
	expect(computed).toBe(inline);
	expect(await link.evaluate((e) => getComputedStyle(e).transitionProperty)).not.toContain(
		"translate",
	);
});

test("the arrow does not move when the pointer is over the link", async ({ page }) => {
	const link = await atLink(page);
	const offset = () =>
		link.evaluate((e) => {
			const arrow = e.querySelector("span") as Element;
			return (
				Math.round((arrow.getBoundingClientRect().left - e.getBoundingClientRect().left) * 10) / 10
			);
		});
	const before = await offset();
	const box = await link.boundingBox();
	if (!box) throw new Error("no link");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
	await page.waitForTimeout(700);
	expect(await offset()).toBe(before);
	await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 4 });
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
	await page.waitForTimeout(700);
	expect(await offset()).toBe(before);
});
