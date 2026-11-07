/*
 * The hero as part of the field. The page's real elements (the logo, the two buttons, the four satellites and the text blocks) stay
 * in the DOM for text, links and keyboard use. This turns them into anchored nodes and clear zones for the field, moves the
 * satellites' labels with their nodes, and sends a click on any of them through the webs.
 */
import type { Field } from "./field.ts";
import { MASTER } from "./geometry.ts";
import type { Anchor, Layout, Rect, SatTarget } from "./types.ts";
import type { ViewBox } from "./view.ts";

const BASE = MASTER.nodes.length;

/** The node ids of the page's own parts, known once the layout is made. */
export type HeroIds = {
	logo: number;
	/** the two ends of each button, in page order */
	pills: [number, number][];
	/** satellite key -> node id, known once the field is built */
	satellites: Record<string, number>;
};

export type Hero = {
	ids: HeroIds;
	/** Read the page and describe it to the field (anchored nodes, clear zones, satellite targets). */
	layout(vb: ViewBox): Layout;
	/** Tie each satellite's element to the node the field chose for it. */
	attach(field: Field): void;
	/** Every frame: move the satellites with their nodes, and the logo and buttons with the cursor's pull. */
	follow(field: Field, vb: ViewBox): void;
	/** Put the elements back as the page had them. */
	release(): void;
	/** Hover, focus and click on the page's parts act on the field. `activity` is told when the visitor does something. */
	bind(field: Field, activity: () => void): void;
};

const shown = (e: Element | null): e is HTMLElement => {
	if (!e) return false;
	return getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0;
};

export function createHero(root: ParentNode = document): Hero {
	const ids: HeroIds = { logo: -1, pills: [], satellites: {} };
	const sats = [...root.querySelectorAll<HTMLElement>("[data-satellite]")];
	const logoEl = () => root.querySelector<HTMLElement>('[data-field-anchor="logo"]');
	const pillEls = () => [...root.querySelectorAll<HTMLElement>('[data-field-anchor="pill"]')];
	const home = new Map<HTMLElement, { left: string; top: string }>();
	const lastPos = new Map<HTMLElement, [number, number]>();
	const shifted = new Map<HTMLElement, string>();
	let satNode: Record<string, number> = {};

	function layout(vb: ViewBox): Layout {
		const s = vb.s;
		const wx = (px: number) => vb.x + px / s;
		const wy = (py: number) => vb.y + (py + window.scrollY) / s; // the page's own coordinates, whatever the scroll
		const wyv = (py: number) => vb.y + py / s; // for the satellites, which are fixed in the viewport
		const anchors: Anchor[] = [];
		ids.logo = -1;
		ids.pills = [];
		const logo = logoEl();
		if (logo) {
			const r = logo.getBoundingClientRect();
			const R = r.width / 2 / s;
			ids.logo = BASE + anchors.length;
			anchors.push({
				fixed: true,
				kind: "hero",
				style: "holes",
				x: wx(r.left + r.width / 2),
				y: wy(r.top + r.height / 2),
				R,
				ro: 0.78 * R,
				ri: 0.62 * R,
				pitch: 0.9 * R,
				hole: 0.04 * R,
				n: 4,
				a0: 25,
			});
		}
		for (const pill of pillEls()) {
			const p = pill.getBoundingClientRect();
			const rc = p.height / 2 / s;
			const cy = wy(p.top + p.height / 2);
			const l = BASE + anchors.length;
			ids.pills.push([l, l + 1]);
			anchors.push({
				fixed: true,
				kind: "cap",
				style: "plain",
				x: wx(p.left) + rc,
				y: cy,
				R: rc,
				ro: 0,
				ri: 0,
				partner: l + 1,
				pillLeft: true,
			});
			anchors.push({
				fixed: true,
				kind: "cap",
				style: "plain",
				x: wx(p.right) - rc,
				y: cy,
				R: rc,
				ro: 0,
				ri: 0,
				partner: l,
			});
		}
		// satellites are field nodes chosen by the field: here only the target points (the DOM defaults) are given
		const satTargets: SatTarget[] = [];
		for (const e of sats) {
			if (!shown(e) || e.getAttribute("data-live") === "1") continue;
			const q = e.getBoundingClientRect();
			satTargets.push({
				key: e.dataset.satellite as string,
				x: wx(q.left + q.width / 2),
				y: wyv(q.top + q.height / 2),
			});
		}
		const pad = 14;
		const rects: Rect[] = [];
		for (const e of root.querySelectorAll<HTMLElement>("[data-quiet]")) {
			if (!shown(e)) continue;
			const q = e.getBoundingClientRect();
			rects.push([wx(q.left - pad), wy(q.top - pad), wx(q.right + pad), wy(q.bottom + pad)]);
		}
		// the lower satellites hang off the buttons (the first to the first button's left end, the second to the second's right end)
		// when close enough
		const lower = satTargets.filter((t) => t.y > vb.y + vb.h * 0.6).map((t) => t.key);
		const first = ids.pills[0];
		const second = ids.pills[1];
		const bondSpec: [string, number][] = [];
		if (lower[0] !== undefined && first) bondSpec.push([lower[0], first[0]]);
		if (lower[1] !== undefined && second) bondSpec.push([lower[1], second[1]]);
		return { anchors, rects, bondSpec, satTargets, view: { x: vb.x, y: vb.y, w: vb.w, h: vb.h } };
	}

	function attach(field: Field): void {
		satNode = field.satIds();
		ids.satellites = {};
		for (const e of sats) {
			const key = e.dataset.satellite as string;
			if (!home.has(e)) home.set(e, { left: e.style.left, top: e.style.top });
			const id = satNode[key];
			if (id === undefined) {
				e.style.display = "none";
				continue;
			}
			e.setAttribute("data-live", "1");
			e.style.left = "0";
			e.style.top = "0";
			ids.satellites[key] = id;
		}
		lastPos.clear();
	}

	/** The logo and the buttons never move on their own; they shift only as far as the cursor pulls them. */
	function shift(field: Field, vb: ViewBox): void {
		const parts: [HTMLElement | null, number | undefined][] = [[logoEl(), ids.logo]];
		for (const [i, e] of pillEls().entries()) parts.push([e, ids.pills[i]?.[0]]);
		for (const [e, id] of parts) {
			const n = id === undefined ? undefined : field.state.nodes[id];
			if (!n || !e) continue;
			const x = Math.round(n.qx * vb.s * 20) / 20;
			const y = Math.round(n.qy * vb.s * 20) / 20;
			const sig = `${x},${y}`;
			if (shifted.get(e) === sig) continue;
			shifted.set(e, sig);
			e.style.transform = x || y ? `translate3d(${x}px,${y}px,0)` : "";
		}
	}

	function follow(field: Field, vb: ViewBox): void {
		shift(field, vb);
		for (const e of sats) {
			const id = satNode[e.dataset.satellite as string];
			const n = id === undefined ? undefined : field.state.nodes[id];
			if (!n) continue;
			const x = Math.round((n.x - vb.x) * vb.s * 10) / 10;
			const y = Math.round((n.y - vb.y) * vb.s * 10) / 10;
			const last = lastPos.get(e);
			if (last && last[0] === x && last[1] === y) continue;
			lastPos.set(e, [x, y]);
			e.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
		}
	}

	function release(): void {
		for (const e of [logoEl(), ...pillEls()]) if (e) e.style.transform = "";
		shifted.clear();
		for (const e of sats) {
			const h = home.get(e);
			if (!h) continue;
			e.removeAttribute("data-live");
			e.style.display = "";
			e.style.left = h.left;
			e.style.top = h.top;
			e.style.transform = "";
		}
		satNode = {};
		ids.satellites = {};
	}

	function bind(field: Field, activity: () => void): void {
		const keyed: [HTMLElement | null, () => number[]][] = [
			[logoEl(), () => (ids.logo < 0 ? [] : [ids.logo])],
			...pillEls().map((e, i): [HTMLElement, () => number[]] => [e, () => ids.pills[i] ?? []]),
			...sats.map((e): [HTMLElement, () => number[]] => {
				const key = e.dataset.satellite as string;
				return [
					e,
					() => (ids.satellites[key] === undefined ? [] : [ids.satellites[key] as number]),
				];
			}),
		];
		for (const [e, nodes] of keyed) {
			if (!e) continue;
			const hot = (on: boolean) => {
				for (const n of nodes()) field.setHot(n, on);
			};
			e.addEventListener("mouseenter", () => {
				activity();
				hot(true);
			});
			e.addEventListener("mouseleave", () => hot(false));
			e.addEventListener("focus", () => hot(true));
			e.addEventListener("blur", () => hot(false));
			e.addEventListener("click", (ev) => {
				activity();
				const first = nodes()[0];
				if (first !== undefined) field.pulse(first);
				const href = e.getAttribute("href");
				if (!href || href.startsWith("#")) {
					ev.preventDefault();
					const dest = href && href.length > 1 ? document.querySelector(href) : null;
					dest?.scrollIntoView({ behavior: "smooth", block: "start" });
					return;
				}
				if (e.getAttribute("target") === "_blank" || ev.metaKey || ev.ctrlKey || ev.shiftKey)
					return; // opens a new tab at once
				ev.preventDefault();
				setTimeout(() => {
					location.href = href;
				}, 380); // let the pulse leave first
			});
		}
	}

	return { ids, layout, attach, follow, release, bind };
}
