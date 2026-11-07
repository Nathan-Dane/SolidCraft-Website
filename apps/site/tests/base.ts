import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

/**
 * The entrance plays once per session; the tests that are not about it start on a page that has already shown it. Nothing reaches
 * GitHub's API: every page load would spend the machine's anonymous rate limit, and the real site would then lose its version line.
 */
export const test = base.extend({
	context: async ({ context }, use) => {
		await context.addInitScript(() => sessionStorage.setItem("sc-intro", "1"));
		await context.route("https://api.github.com/**", (route) => route.abort());
		await use(context);
	},
});
