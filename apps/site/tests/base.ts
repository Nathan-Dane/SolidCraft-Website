import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

/** The entrance plays once per session; the tests that are not about it start on a page that has already shown it. */
export const test = base.extend({
	context: async ({ context }, use) => {
		await context.addInitScript(() => sessionStorage.setItem("sc-intro", "1"));
		await use(context);
	},
});
