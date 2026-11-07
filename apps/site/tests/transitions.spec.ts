import { expect, type Page, test } from "./base";

const hasViewTransition = (page: Page) =>
	page.evaluate(() => {
		const walk = (rules: CSSRuleList): boolean =>
			[...rules].some(
				(r) =>
					r.constructor.name === "CSSViewTransitionRule" ||
					("cssRules" in r && walk(r.cssRules as CSSRuleList)),
			);
		return [...document.styleSheets].some((s) => walk(s.cssRules));
	});

test("same-site links are prefetched when likely to be followed", async ({ page }) => {
	await page.goto("/");
	const rules = await page.locator('script[type="speculationrules"]').textContent();
	expect(JSON.parse(rules ?? "{}")).toEqual({
		prefetch: [{ where: { href_matches: "/*" }, eagerness: "moderate" }],
	});
});

test("pages cross-fade while the bar and backdrop keep still", async ({ page }) => {
	await page.goto("/");
	expect(await hasViewTransition(page)).toBe(true);
	const names = await page.evaluate(() =>
		[".bar", ".backdrop"].map(
			(s) => getComputedStyle(document.querySelector(s) as Element).viewTransitionName,
		),
	);
	expect(names).toEqual(["bar", "backdrop"]);
});

test("the page transition is only declared for visitors who do not ask for reduced motion", async ({
	page,
}) => {
	await page.goto("/");
	const conditions = await page.evaluate(() => {
		const found: string[] = [];
		const walk = (rules: CSSRuleList, media: string) => {
			for (const r of rules) {
				if (r.constructor.name === "CSSViewTransitionRule") found.push(media);
				else if (r instanceof CSSMediaRule) walk(r.cssRules, r.conditionText);
				else if ("cssRules" in r) walk(r.cssRules as CSSRuleList, media);
			}
		};
		for (const s of document.styleSheets) walk(s.cssRules, "");
		return found;
	});
	expect(conditions).toHaveLength(1);
	expect(conditions[0]).toContain("prefers-reduced-motion: no-preference");
});
