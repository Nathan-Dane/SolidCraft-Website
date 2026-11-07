/*
 * The elements the cursor can take the shape of: everything marked `data-focus`. The registry does not scan the page. An
 * IntersectionObserver keeps the set of the ones on screen, a ResizeObserver keeps their rectangles right, and a
 * MutationObserver notices ones added or removed later (a list the page builds). Each rectangle is measured once, unleaned, in page
 * coordinates (or window coordinates for fixed ones), so nothing reads layout while the cursor moves.
 */
import { cornerRadius } from "./geometry.ts";

export const FOCUS = "[data-focus]";

export type FocusItem = {
	el: HTMLElement;
	/** centre, unleaned: page coordinates, or window coordinates when `fixed` */
	cx: number;
	cy: number;
	w: number;
	h: number;
	fixed: boolean;
	/** corner radius, read when first needed */
	r: number;
	visible: boolean;
};

export type Registry = {
	/** The items that are on screen. */
	visible(): readonly FocusItem[];
	/** Measure everything again (after a layout change). */
	measure(): void;
	/** Called when the set or the rectangles changed. */
	onchange: (() => void) | null;
	destroy(): void;
};

function isFixed(el: Element): boolean {
	for (let e: Element | null = el; e; e = e.parentElement) {
		if (getComputedStyle(e).position === "fixed") return true;
	}
	return false;
}

export function createRegistry(root: ParentNode = document, doc: Document = document): Registry {
	const items = new Map<Element, FocusItem>();
	const onscreen = new Set<FocusItem>();
	let list: FocusItem[] = [];
	let remeasureTimer = 0;

	const rebuildList = () => {
		list = [...onscreen];
	};

	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const item = items.get(entry.target);
				if (!item) continue;
				item.visible = entry.isIntersecting;
				if (entry.isIntersecting) onscreen.add(item);
				else onscreen.delete(item);
			}
			rebuildList();
			registry.onchange?.();
		},
		{ rootMargin: "80px" },
	);

	function measureOne(item: FocusItem): void {
		const b = item.el.getBoundingClientRect();
		const st = item.el.style.translate; // a lean in progress is not part of where the element is
		item.fixed = isFixed(item.el);
		const lean = parseLean(st);
		item.w = b.width;
		item.h = b.height;
		item.cx = b.left + b.width / 2 - lean[0];
		item.cy = b.top + b.height / 2 - lean[1] + (item.fixed ? 0 : window.scrollY);
		item.r = cornerRadius(getComputedStyle(item.el).borderTopLeftRadius || "0", b.width, b.height);
	}

	const ro = new ResizeObserver(() => scheduleMeasure());

	function add(el: HTMLElement): void {
		if (items.has(el)) return;
		const item: FocusItem = { el, cx: 0, cy: 0, w: 0, h: 0, fixed: false, r: 0, visible: false };
		items.set(el, item);
		measureOne(item);
		io.observe(el);
		ro.observe(el);
	}

	function remove(el: Element): void {
		const item = items.get(el);
		if (!item) return;
		items.delete(el);
		onscreen.delete(item);
		io.unobserve(el);
		ro.unobserve(el);
		rebuildList();
	}

	function scan(node: ParentNode): void {
		for (const el of node.querySelectorAll<HTMLElement>(FOCUS)) add(el);
	}

	function scheduleMeasure(): void {
		clearTimeout(remeasureTimer);
		remeasureTimer = window.setTimeout(() => registry.measure(), 60);
	}

	const mo = new MutationObserver((records) => {
		for (const rec of records) {
			for (const n of rec.addedNodes) {
				if (n.nodeType !== 1) continue;
				const el = n as HTMLElement;
				if (el.matches(FOCUS)) add(el);
				scan(el);
			}
			for (const n of rec.removedNodes) {
				if (n.nodeType !== 1) continue;
				const el = n as HTMLElement;
				if (el.matches(FOCUS)) remove(el);
				for (const inner of el.querySelectorAll(FOCUS)) remove(inner);
			}
		}
	});

	const onTransitionEnd = (e: Event) => {
		const t = e.target as Element | null;
		if (!t) return;
		// a block that moved into place (a reveal, the entrance's rise) takes the shapes inside it with it
		const moved = /^(translate|transform|top|left|margin)/.test(
			(e as TransitionEvent).propertyName ?? "",
		);
		if (t.classList?.contains("rv") || (moved && (t.matches(FOCUS) || t.querySelector(FOCUS)))) {
			scheduleMeasure();
		}
	};

	const registry: Registry = {
		visible: () => list,
		measure() {
			for (const item of items.values()) measureOne(item);
			registry.onchange?.();
		},
		onchange: null,
		destroy() {
			io.disconnect();
			ro.disconnect();
			mo.disconnect();
			clearTimeout(remeasureTimer);
			doc.removeEventListener("transitionend", onTransitionEnd, true);
			items.clear();
			onscreen.clear();
			list = [];
		},
	};

	scan(root);
	mo.observe(doc.body, { childList: true, subtree: true });
	ro.observe(doc.body);
	doc.addEventListener("transitionend", onTransitionEnd, true);
	void doc.fonts?.ready.then(scheduleMeasure);
	return registry;
}

/** The lean of an element from its `translate` style, in px. */
export function parseLean(translate: string): [number, number] {
	if (!translate) return [0, 0];
	const parts = translate.split(/\s+/).map(Number.parseFloat);
	return [parts[0] || 0, parts[1] || 0];
}
