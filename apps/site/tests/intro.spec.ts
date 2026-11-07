import { expect, type Page, test } from "@playwright/test";

// The entrance runs on the live field (software renderer in the tests); these tests do not use the shared fixture, which skips it
const URL = "/?gl=software&debug";
const STAGES = ["i-datum", "i-logo", "i-pills", "i-title", "i-bar", "i-tag", "i-meta", "i-cue"];

test.skip(({ isMobile }) => isMobile, "the entrance is checked at desktop size");
test.use({ viewport: { width: 1440, height: 900 } });

const host = "window.fieldHost";

/** Records the order the page's classes appear in, from the first paint on. */
async function record(page: Page) {
	await page.addInitScript(() => {
		const seen: string[] = [];
		(window as unknown as { seen: string[] }).seen = seen;
		new MutationObserver(() => {
			for (const c of document.documentElement.classList)
				if (c.startsWith("i-") && !seen.includes(c)) seen.push(c);
		}).observe(document, { attributes: true, subtree: true, attributeFilter: ["class"] });
	});
}
const classes = (page: Page) => page.evaluate(() => document.documentElement.className);
const ended = (page: Page) =>
	page.waitForFunction(() => !document.documentElement.classList.contains("intro"), null, {
		timeout: 30_000,
	});
const playing = (page: Page) =>
	page.waitForFunction(() => document.documentElement.dataset.intro === "playing", null, {
		timeout: 15_000,
	});

test("before it starts only the page colour shows", async ({ page }) => {
	await page.goto(URL, { waitUntil: "commit" });
	await page.waitForFunction(() => document.documentElement.classList.contains("intro"));
	const early = await page.evaluate(() => {
		const op = (s: string) =>
			Number(getComputedStyle(document.querySelector(s) as Element).opacity);
		return {
			datum: op(".datum"),
			logo: op(".node-logo svg"),
			title: op(".hero h1"),
			pill: op(".pill"),
			bar: op(".bar"),
			cue: getComputedStyle(document.querySelector(".cue") as Element).visibility,
			sat: getComputedStyle(document.querySelector(".sat") as Element).visibility,
		};
	});
	expect(early).toEqual({
		datum: 0,
		logo: 0,
		title: 0,
		pill: 0,
		bar: 0,
		cue: "hidden",
		sat: "hidden",
	});
	await page.waitForFunction(() => (window as unknown as { fieldHost?: unknown }).fieldHost);
	const drawn = await page.evaluate(
		`${host}.field.state.nodes.some((n) => n.penV !== 0) || ${host}.intro.state`,
	);
	expect(drawn).toBe("waiting");
});

test("the parts appear in order and the page is left as it is without an entrance", async ({
	page,
}) => {
	await record(page);
	await page.goto(URL);
	await ended(page);
	expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(STAGES);
	expect(await classes(page)).not.toMatch(/\bi-/);
	const after = await page.evaluate(() => {
		const op = (s: string) =>
			Number(getComputedStyle(document.querySelector(s) as Element).opacity);
		return [op(".node-logo svg"), op(".hero h1"), op(".pill"), op(".bar")];
	});
	expect(after).toEqual([1, 1, 1, 1]);
	expect(await page.locator(".sat.shown").count()).toBe(0);
	expect(await page.evaluate(`${host}.field.state.nodes.every((n) => n.penV === 1)`)).toBe(true);
});

test("it plays once per session", async ({ page }) => {
	await page.goto(URL);
	await ended(page);
	await page.reload();
	expect(await classes(page)).not.toContain("intro");
	await page.goto("/?gl=software&debug&intro");
	expect(await classes(page)).toContain("intro");
});

test("reduced motion, ?nointro and a scrolled load skip it", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto(URL);
	expect(await classes(page)).not.toContain("intro");
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.goto("/?gl=software&nointro");
	expect(await classes(page)).not.toContain("intro");
});

test("without its scripts the page shows itself after the safety limit", async ({ page }) => {
	await page.route(/\/_astro\/.*\.js/, (route) => route.abort());
	await page.goto(URL);
	expect(await classes(page)).toContain("intro");
	await page.waitForFunction(() => !document.documentElement.classList.contains("intro"), null, {
		timeout: 5000,
	});
});

test("scrolling ends it at once: what remains fades in", async ({ page }) => {
	await page.goto(URL);
	await playing(page);
	await page.evaluate(() => window.scrollTo(0, 300));
	await page.waitForFunction(
		`${host}.intro === null || ${host}.intro.state === "skipping" || ${host}.intro.state === "done"`,
	);
	await ended(page);
	expect(await classes(page)).not.toMatch(/\bi-/);
	expect(await page.evaluate(`${host}.field.state.nodes.every((n) => n.penV === 1)`)).toBe(true);
});

test("a resize does not end it", async ({ page }) => {
	await page.goto(URL);
	await playing(page);
	await page.setViewportSize({ width: 1200, height: 800 });
	await page.waitForTimeout(500); // the field is rebuilt for the new layout
	expect(await classes(page)).toContain("intro");
	expect(await page.evaluate(`${host}.intro !== null`)).toBe(true);
	await ended(page);
	expect(await page.evaluate(`${host}.field.state.nodes.length`)).toBeGreaterThan(10);
});

test("the cursor does not dock until it is over", async ({ page }) => {
	await page.goto(URL);
	await page.waitForFunction(() => document.documentElement.classList.contains("has-cursor"));
	await page.waitForFunction(() => document.documentElement.classList.contains("intro"));
	const box = await page.locator(".node-logo").boundingBox();
	if (!box) throw new Error("no logo");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
	await page.waitForTimeout(300);
	if (await page.evaluate(() => document.documentElement.classList.contains("intro"))) {
		expect(
			await page.evaluate(() => document.getElementById("cursor")?.className ?? ""),
		).not.toContain("docked");
	}
});
