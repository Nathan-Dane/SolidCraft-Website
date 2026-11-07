import { expect, type Page, test } from "@playwright/test";

// The tests run the live field on a software renderer (?gl=software), which the page refuses by default
const URL = "/?gl=software&debug";

test.skip(({ isMobile }) => isMobile, "the field is checked at desktop size");
test.use({ viewport: { width: 1440, height: 900 } });

type Probe = {
	fieldHost: {
		tier: string;
		view: { x: number; y: number; s: number };
		field: {
			step: (dt: number, noRender?: boolean) => void;
			state: { t: number; nodes: { x: number; y: number; fixed: boolean }[] };
		} | null;
		hero: { ids: { logo: number; pills: [number, number][]; satellites: Record<string, number> } };
	};
};

async function live(page: Page, url = URL) {
	await page.goto(url);
	await page.waitForFunction(() => (window as unknown as Partial<Probe>).fieldHost !== undefined);
}

test("the field runs behind the hero and shows the satellites", async ({ page }) => {
	await live(page);
	await expect(page.locator("html")).toHaveAttribute("data-field", "live");
	await expect(page.locator(".backdrop")).toHaveClass(/\blive\b/);
	const canvas = await page.locator(".field-canvas").boundingBox();
	expect(canvas?.width).toBe(1440);
	expect(canvas?.height).toBe(900);
	await expect(page.locator(".sat")).toHaveCount(4);
	for (const sat of await page.locator(".sat").all()) await expect(sat).toBeVisible();
	await expect(page.locator(".poster")).toBeHidden();
});

test("the logo and the buttons sit exactly on their nodes at every scroll position", async ({
	page,
}) => {
	await live(page);
	for (const y of [0, 150, 400, 700]) {
		await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
		await page.waitForTimeout(250);
		const gap = await page.evaluate(() => {
			const host = (window as unknown as Probe).fieldHost;
			const field = host.field;
			if (!field) return [Number.NaN];
			const parts: [Element | null, number | undefined][] = [
				[document.querySelector('[data-field-anchor="logo"]'), host.hero.ids.logo],
				[document.querySelector("#dl"), host.hero.ids.pills[0]?.[0]],
			];
			return parts.map(([el, id]) => {
				const n = id === undefined ? undefined : field.state.nodes[id];
				if (!el || !n) return Number.NaN;
				const r = el.getBoundingClientRect();
				const cx = (n.x - host.view.x) * host.view.s;
				const cy = (n.y - host.view.y) * host.view.s;
				// the logo is a circle at its centre; the pill's node is its left end
				const dx = el.id === "dl" ? r.left + r.height / 2 - cx : r.left + r.width / 2 - cx;
				return Math.hypot(dx, r.top + r.height / 2 - cy);
			});
		});
		for (const g of gap) expect(g, `scroll ${y}`).toBeLessThan(1);
	}
});

test("satellite labels sit on their nodes", async ({ page }) => {
	await live(page);
	await page.waitForTimeout(300);
	const gaps = await page.evaluate(() => {
		const host = (window as unknown as Probe).fieldHost;
		const field = host.field;
		if (!field) return [];
		return [...document.querySelectorAll<HTMLElement>("[data-satellite]")]
			.filter((e) => getComputedStyle(e).display !== "none")
			.map((e) => {
				const id = host.hero.ids.satellites[e.dataset.satellite as string];
				const n = id === undefined ? undefined : field.state.nodes[id];
				const r = e.getBoundingClientRect();
				if (!n) return Number.NaN;
				return Math.hypot(
					r.left + r.width / 2 - (n.x - host.view.x) * host.view.s,
					r.top + r.height / 2 - (n.y - host.view.y) * host.view.s,
				);
			});
	});
	expect(gaps.length).toBeGreaterThan(0);
	for (const g of gaps) expect(g).toBeLessThan(1);
});

test("the satellites fade over the first fifth of a window", async ({ page }) => {
	await live(page);
	const opacity = async (y: number) => {
		await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
		await page.waitForTimeout(250);
		return Number(
			await page
				.locator(".sat")
				.first()
				.evaluate((e) => getComputedStyle(e).opacity),
		);
	};
	expect(await opacity(0)).toBe(1);
	expect(await opacity(90)).toBeCloseTo(0.5, 1);
	await page.evaluate(() => window.scrollTo({ top: 400, behavior: "instant" }));
	await page.waitForTimeout(250);
	await expect(page.locator(".sat").first()).toBeHidden();
});

test("the field is parked once the hero has left, and wakes on the way back", async ({ page }) => {
	await live(page);
	const time = () =>
		page.evaluate(() => (window as unknown as Probe).fieldHost.field?.state.t ?? Number.NaN);
	await page.evaluate(() => window.scrollTo({ top: 3000, behavior: "instant" }));
	await page.waitForTimeout(400);
	await expect(page.locator(".backdrop")).toHaveClass(/\bparked\b/);
	await expect(page.locator(".field-canvas")).toBeHidden();
	const t0 = await time();
	await page.waitForTimeout(600);
	expect(await time()).toBe(t0);
	await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
	await page.waitForTimeout(600);
	await expect(page.locator(".backdrop")).not.toHaveClass(/\bparked\b/);
	await expect(page.locator(".field-canvas")).toBeVisible();
	expect(await time()).toBeGreaterThan(t0);
});

test("the field is throttled to the page's pace, not the display's", async ({ page }) => {
	await live(page);
	await page.evaluate(() => {
		const f = (window as unknown as Probe).fieldHost.field;
		if (!f) return;
		const w = window as unknown as { steps: number };
		w.steps = 0;
		const original = f.step;
		f.step = (dt, noRender) => {
			w.steps++;
			original(dt, noRender);
		};
	});
	const count = async (ms: number) => {
		await page.evaluate(() => {
			(window as unknown as { steps: number }).steps = 0;
		});
		await page.waitForTimeout(ms);
		return (
			(await page.evaluate(() => (window as unknown as { steps: number }).steps)) / (ms / 1000)
		);
	};
	await page.waitForTimeout(2600); // activity from loading wears off
	const idle = await count(2000);
	expect(idle).toBeGreaterThan(12);
	expect(idle).toBeLessThan(25);
	await page.mouse.move(700, 300);
	await page.mouse.move(720, 320);
	// the active pace (30) is checked against the scheduler itself; here the page must not exceed it, even on a fast display
	expect(await count(1000)).toBeLessThan(36);
});

test("without WebGL the poster is shown and there is no field", async ({ page }) => {
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext = function (
			this: HTMLCanvasElement,
			type: string,
			...rest: unknown[]
		) {
			if (type.includes("webgl")) return null;
			return (original as (t: string, ...r: unknown[]) => unknown).call(
				this,
				type,
				...rest,
			) as never;
		} as typeof original;
	});
	await page.goto("/?debug");
	await expect(page.locator("html")).toHaveAttribute("data-field", "poster");
	await expect(page.locator(".poster img")).toBeVisible();
	await expect(page.locator(".field-canvas")).toBeHidden();
	await expect(page.locator(".sat").first()).toBeHidden();
});

test("with reduced motion the field is drawn once and does not move", async ({ page }) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await live(page);
	await expect(page.locator("html")).toHaveAttribute("data-field", "still");
	await expect(page.locator(".field-canvas")).toBeVisible();
	const time = () =>
		page.evaluate(() => (window as unknown as Probe).fieldHost.field?.state.t ?? Number.NaN);
	const t0 = await time();
	await page.waitForTimeout(800);
	expect(await time()).toBe(t0);
});
