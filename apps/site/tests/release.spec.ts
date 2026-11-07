import { expect, type Page, test } from "@playwright/test";

const list = [
	{
		tag_name: "v0.31.0-rc1",
		html_url: "https://github.com/tangency-labs/solidcraft/releases/tag/v0.31.0-rc1",
		prerelease: true,
		draft: false,
		assets: [],
	},
	{
		tag_name: "v0.30.1",
		html_url: "https://github.com/tangency-labs/solidcraft/releases/tag/v0.30.1",
		prerelease: false,
		draft: false,
		assets: [
			{
				name: "solidcraft-0.30.1-freebsd-x86_64.tar.gz",
				browser_download_url: "https://example.test/solidcraft-freebsd.tar.gz",
			},
		],
	},
];

async function open(page: Page, response: "ok" | "fail") {
	await page.route("https://api.github.com/repos/**", (route) =>
		response === "ok"
			? route.fulfill({ json: list })
			: route.fulfill({ status: 403, body: "rate limited" }),
	);
	await page.goto("/");
}

test("the version line shows the latest stable release", async ({ page }) => {
	await open(page, "ok");
	await expect(page.locator("#ver")).toContainText("v0.30.1 available");
	await expect(page.locator("#ver")).toHaveAttribute("href", list[1]?.html_url ?? "");
	await expect(page.locator("#dl")).toHaveAttribute(
		"href",
		/releases\/download\/v0\.30\.1\/solidcraft-macos-universal\.dmg/,
	);
});

test("the pre-release switch retargets the version and the downloads, and is remembered", async ({
	page,
}) => {
	await open(page, "ok");
	await expect(page.locator("#ver")).toContainText("v0.30.1 available");
	await page.getByRole("switch", { name: "Pre-release" }).click();
	await expect(page.locator("#ver")).toContainText("v0.31.0-rc1 pre-release");
	await expect(page.locator("#dl")).toHaveAttribute("href", /download\/v0\.31\.0-rc1\//);
	await page.reload();
	await expect(page.locator("#ver")).toContainText("v0.31.0-rc1 pre-release");
});

test("More downloads lists four platforms and closes on Escape and outside clicks", async ({
	page,
}) => {
	await open(page, "ok");
	await expect(page.locator("#ver")).toContainText("v0.30.1"); // the island is ready
	const more = page.getByRole("button", { name: "More downloads" });
	await more.click();
	const plats = page.getByRole("navigation", { name: "Latest build for" }).getByRole("link");
	await expect(plats).toHaveText(["Windows", "macOS", "Linux", "FreeBSD"]);
	await expect(page.locator('[data-plat="freebsd"]')).toHaveAttribute(
		"href",
		"https://example.test/solidcraft-freebsd.tar.gz",
	);
	await expect(page.locator("#more-menu")).toBeVisible();
	await page.waitForTimeout(100); // the close handlers are attached after the next paint
	await page.keyboard.press("Escape");
	await expect(more).toHaveAttribute("aria-expanded", "false");
	await more.click();
	await expect(page.locator("#more-menu")).toBeVisible();
	await page.waitForTimeout(100);
	await page.mouse.click(20, 400);
	await expect(more).toHaveAttribute("aria-expanded", "false");
});

test("without the release list the links point at the latest release", async ({ page }) => {
	await open(page, "fail");
	await expect(page.locator("#ver")).toContainText("latest release");
	await page.waitForTimeout(500); // the island is ready once idle
	await expect(page.locator("#dl")).toHaveAttribute(
		"href",
		/releases\/latest\/download\/solidcraft-macos-universal\.dmg/,
	);
	await page.getByRole("button", { name: "More downloads" }).click();
	await expect(page.locator('[data-plat="freebsd"]')).toHaveAttribute(
		"href",
		"https://github.com/tangency-labs/solidcraft/releases/latest",
	);
});
