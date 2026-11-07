import { expect, test } from "@playwright/test";

test("the four satellites link to pages and are not shown without the field", async ({ page }) => {
	await page.goto("/");
	const links = await page.$$eval(".sat", (els) =>
		els.map((e) => [
			e.getAttribute("data-satellite"),
			e.getAttribute("href"),
			e.querySelector("span")?.firstChild?.textContent,
			e.querySelector("small")?.textContent,
		]),
	);
	expect(links).toEqual([
		["plugins", "/plugins/", "Plugins", "add-ons"],
		["themes", "/themes/", "Themes", "studio"],
		["solidcore", "/features/#solidcore", "SolidCore", "kernel"],
		["agents", "/features/#agents", "Agents", "MCP"],
	]);
	await expect(page.locator(".sat").first()).toBeHidden();
});
