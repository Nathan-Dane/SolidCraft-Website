import { expect, type Page, test } from "./base";

test.skip(({ isMobile }) => isMobile, "touch screens have no cursor");
test.use({ viewport: { width: 1440, height: 900 } });

const state = (page: Page) =>
	page.evaluate(() => {
		const r = document.querySelector(".cur-ring")?.getBoundingClientRect();
		const host = document.getElementById("cursor");
		return {
			cls: host?.className ?? "",
			ring: r ? [r.x, r.y, r.width, r.height] : [0, 0, 0, 0],
			beam: document.querySelector(".cur-dot")?.classList.contains("beam") ?? false,
			glow: Number(getComputedStyle(document.querySelector(".cur-glow") as Element).opacity),
			dot: Number(getComputedStyle(document.querySelector(".cur-dot") as Element).opacity),
		};
	});

async function ready(page: Page, url = "/features/") {
	await page.goto(url);
	await page.waitForFunction(() => document.documentElement.classList.contains("has-cursor"));
}

async function moveTo(page: Page, x: number, y: number) {
	await page.mouse.move(x, y, { steps: 8 });
	await page.waitForTimeout(700);
}

test("the native pointer is hidden everywhere and the ring appears with the first move", async ({
	page,
}) => {
	await ready(page);
	expect((await state(page)).cls).not.toContain("on");
	await moveTo(page, 500, 500);
	expect((await state(page)).cls).toContain("on");
	const cursors = await page.evaluate(() =>
		[".bar", ".bar nav:not(.drawer) a", ".mini", "main", "footer"].map(
			(s) => getComputedStyle(document.querySelector(s) as Element).cursor,
		),
	);
	expect(new Set(cursors)).toEqual(new Set(["none"]));
});

test("over a link the ring takes its exact shape, the dot gives way and a faint glow shows", async ({
	page,
}) => {
	await ready(page);
	const box = await page.locator(".bar nav:not(.drawer) a", { hasText: "Themes" }).boundingBox();
	if (!box) throw new Error("no link");
	await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
	const s = await state(page);
	expect(s.cls).toContain("docked");
	expect(Math.abs((s.ring[2] ?? 0) - box.width)).toBeLessThan(1.5);
	expect(Math.abs((s.ring[3] ?? 0) - box.height)).toBeLessThan(1.5);
	expect(Math.abs((s.ring[0] ?? 0) - box.x)).toBeLessThan(6); // the link leans toward the pointer by a few px
	expect(s.dot).toBe(0);
	expect(s.glow).toBe(1);
	await moveTo(page, 700, 500);
	const free = await state(page);
	expect(free.cls).not.toContain("docked");
	expect(free.glow).toBe(0);
	expect(Math.round(free.ring[2] ?? 0)).toBe(28);
});

test("a docked element leans toward the pointer by a few pixels and settles back", async ({
	page,
}) => {
	await ready(page);
	const link = page.locator(".bar nav:not(.drawer) a", { hasText: "Themes" });
	const box = await link.boundingBox();
	if (!box) throw new Error("no link");
	await moveTo(page, box.x + box.width - 4, box.y + box.height / 2);
	const lean = await link.evaluate((e) => getComputedStyle(e).translate);
	expect(lean).not.toBe("none");
	expect(Math.abs(Number.parseFloat(lean))).toBeLessThanOrEqual(5.1);
	await moveTo(page, 700, 500);
	await page.waitForTimeout(600);
	expect(await link.evaluate((e) => getComputedStyle(e).translate)).toBe("none");
});

test("over selectable text the dot becomes a beam as tall as the line and the ring steps aside", async ({
	page,
}) => {
	await ready(page);
	const lede = await page.locator(".prose p").first().boundingBox();
	if (!lede) throw new Error("no text");
	await moveTo(page, lede.x + 40, lede.y + 12);
	const s = await state(page);
	expect(s.beam).toBe(true);
	expect(s.cls).toContain("text");
	const h = await page.evaluate(() =>
		Number.parseFloat(
			(document.querySelector(".cur-dot") as HTMLElement).style.getPropertyValue("--bh"),
		),
	);
	expect(h).toBeGreaterThanOrEqual(14);
	expect(h).toBeLessThanOrEqual(46);
	await moveTo(page, 20, 600);
	expect((await state(page)).beam).toBe(false);
});

test("where two outlines overlap the one on top takes the ring at once", async ({ page }) => {
	await ready(page);
	const a = await page.locator(".bar nav:not(.drawer) a", { hasText: "Features" }).boundingBox();
	const b = await page.locator(".bar nav:not(.drawer) a", { hasText: "Plugins" }).boundingBox();
	if (!a || !b) throw new Error("no links");
	await moveTo(page, a.x + a.width / 2, a.y + a.height / 2);
	expect(Math.abs(((await state(page)).ring[2] ?? 0) - a.width)).toBeLessThan(1.5);
	await page.mouse.move(b.x + 2, b.y + b.height / 2, { steps: 20 });
	await page.waitForTimeout(500);
	expect(Math.abs(((await state(page)).ring[2] ?? 0) - b.width)).toBeLessThan(1.5);
});

test("a click ripples through the outline and pressing tints the ring", async ({ page }) => {
	await ready(page, "/"); // the scroll cue only scrolls, so the page stays
	const box = await page.locator(".cue").boundingBox();
	if (!box) throw new Error("no cue");
	await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	expect((await state(page)).cls).toContain("press");
	await page.mouse.up();
	await expect(page.locator(".cur-ripple")).toHaveCount(1);
	await expect(page.locator(".cur-ripple")).toHaveCount(0, { timeout: 2000 });
});

test("the cursor sleeps when the pointer is still: no frames are asked for", async ({ page }) => {
	await ready(page);
	await moveTo(page, 600, 600);
	await page.waitForTimeout(1200);
	const requested = await page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				let n = 0;
				const original = window.requestAnimationFrame.bind(window);
				window.requestAnimationFrame = (cb) => {
					n++;
					return original(cb);
				};
				setTimeout(() => resolve(n), 800);
			}),
	);
	expect(requested).toBe(0);
});

test("over form fields and away from the window the native cursor and ring step back", async ({
	page,
}) => {
	await ready(page, "/");
	await page.evaluate(() => {
		const input = document.createElement("input");
		input.id = "probe";
		input.style.cssText = "position:fixed;left:40px;top:300px;width:200px;height:40px;z-index:50";
		document.body.appendChild(input);
	});
	await moveTo(page, 100, 320);
	expect((await state(page)).cls).not.toContain("on");
	expect(await page.locator("#probe").evaluate((e) => getComputedStyle(e).cursor)).toBe("text");
});

test("the pointer's place is kept on the next page", async ({ page }) => {
	await ready(page);
	await moveTo(page, 300, 420);
	await page.goto("/plugins/");
	await page.waitForFunction(() => document.documentElement.classList.contains("has-cursor"));
	await page.waitForTimeout(500);
	const s = await state(page);
	expect(s.cls).toContain("on");
	expect(Math.abs((s.ring[0] ?? 0) + (s.ring[2] ?? 0) / 2 - 300)).toBeLessThan(2);
	expect(Math.abs((s.ring[1] ?? 0) + (s.ring[3] ?? 0) / 2 - 420)).toBeLessThan(2);
});

test("on the home page the ring docks on the field's own nodes: the logo and the buttons", async ({
	page,
}) => {
	await ready(page, "/?gl=software&debug");
	await page.waitForFunction(
		() => (window as unknown as { fieldHost?: unknown }).fieldHost !== undefined,
	);
	await page.waitForTimeout(800);
	const dl = await page.locator("#dl").boundingBox();
	if (!dl) throw new Error("no button");
	await moveTo(page, dl.x + dl.width / 2, dl.y + dl.height / 2);
	await page.waitForTimeout(500);
	const s = await state(page);
	expect(s.cls).toContain("docked");
	expect(Math.abs((s.ring[2] ?? 0) - dl.width)).toBeLessThan(6);
	const logo = await page.locator("[data-field-anchor='logo']").boundingBox();
	if (!logo) throw new Error("no logo");
	await moveTo(page, logo.x + logo.width / 2, logo.y + logo.height / 2);
	await page.waitForTimeout(500);
	const l = await state(page);
	expect(l.cls).toContain("docked");
	expect(l.ring[2] ?? 0).toBeGreaterThan(150); // the logo's node is a large disc
});

test("once the field has parked, the ring still follows and still docks on elements", async ({
	page,
}) => {
	await ready(page, "/?gl=software&debug");
	await page.waitForFunction(
		() => (window as unknown as { fieldHost?: unknown }).fieldHost !== undefined,
	);
	await page.evaluate(() => window.scrollTo({ top: 3000, behavior: "instant" }));
	await page.waitForTimeout(500);
	const box = await page.locator(".bar nav:not(.drawer) a", { hasText: "Plugins" }).boundingBox();
	if (!box) throw new Error("no link");
	await moveTo(page, box.x + box.width / 2, box.y + box.height / 2);
	expect((await state(page)).cls).toContain("docked");
});

test("an element above a node always takes the ring, even when the node is already docked", async ({
	page,
}) => {
	await ready(page, "/?gl=software&debug");
	await page.waitForFunction(
		() => (window as unknown as { fieldHost?: unknown }).fieldHost !== undefined,
	);
	const link = await page.locator(".bar nav:not(.drawer) a", { hasText: "Plugins" }).boundingBox();
	if (!link) throw new Error("no link");
	// a node is kept behind the link; the pointer enters the node just below the bar, where no link is, and then moves up into the link
	const cx = link.x + link.width / 2;
	const cy = link.y + link.height / 2;
	const below = link.y + link.height + 30;
	await page.evaluate(
		([x, y]) => {
			const host = (
				window as unknown as {
					fieldHost: {
						view: { x: number; y: number; s: number };
						field: { state: { nodes: { x: number; y: number; fixed: boolean; kind?: string }[] } };
					};
				}
			).fieldHost;
			const node = host.field.state.nodes.find((n) => !n.fixed && n.kind !== "cap");
			if (!node) throw new Error("no node");
			// the field stops drifting, so the node stays where it is put
			(host.field as unknown as { step: () => void }).step = () => {};
			node.x = host.view.x + (x as number) / host.view.s;
			node.y = host.view.y + (y as number) / host.view.s;
		},
		[cx, cy],
	);
	await moveTo(page, cx, below);
	const onNode = await state(page);
	expect(onNode.cls).toContain("docked");
	expect(onNode.ring[2] ?? 0).toBeGreaterThan(link.width * 1.5); // the node, not the link
	await page.mouse.move(cx, cy, { steps: 15 });
	await page.waitForTimeout(500);
	expect(Math.abs(((await state(page)).ring[2] ?? 0) - link.width)).toBeLessThan(1.5);
});
