import { whenField } from "../lib/field-state";

// The cursor is for fine pointers that can hover; touch screens never load it. It starts once the page is idle.
if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
	const start = () => {
		Promise.all([import("@solidcraft/cursor"), import("@solidcraft/frame")]).then(
			([cursorPkg, frame]) => {
				const cursor = cursorPkg.createCursor({ scheduler: frame.pageScheduler() });
				// docking on the field's nodes, once the field is there
				whenField((host) => {
					const field = host.field;
					if (!field) return;
					// measured once, and again after the page was laid out anew: the cursor must not read layout while it moves
					let measured = shapes(host);
					let timer = 0;
					addEventListener("resize", () => {
						clearTimeout(timer);
						timer = window.setTimeout(() => {
							measured = shapes(host);
						}, 400);
					});
					cursor.setField({
						nodes: () => field.state.nodes,
						view: () => host.view,
						shapes: () => measured,
						attract: (id, dx, dy) => field.attract(id, dx, dy),
						setHot: (id, on) => field.setHot(id, on),
					});
					// the field parks once the hero has left: the ring stops docking on nodes but keeps following the pointer
					const sync = () =>
						cursor.setEnabled(!document.documentElement.classList.contains("hero-away"));
					new MutationObserver(sync).observe(document.documentElement, {
						attributes: true,
						attributeFilter: ["class"],
					});
					sync();
				});
				addEventListener("scroll", () => cursor.retarget(), { passive: true });
			},
		);
	};
	if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 1500 });
	else setTimeout(start, 200);
}

type HostLike = import("@solidcraft/field").Host;

/** The logo and the buttons as shapes: their rectangles in page coordinates, and the nodes behind them. */
function shapes(host: HostLike) {
	const ids = host.hero.ids;
	const out: { id: number; ids: number[]; x: number; y: number; w: number; h: number }[] = [];
	const rect = (el: Element | null, nodeIds: number[]) => {
		if (!el || nodeIds.length === 0) return;
		const r = el.getBoundingClientRect();
		out.push({
			id: nodeIds[0] as number,
			ids: nodeIds,
			x: r.left + r.width / 2,
			y: r.top + scrollY + r.height / 2,
			w: r.width,
			h: r.height,
		});
	};
	rect(document.querySelector('[data-field-anchor="logo"]'), ids.logo < 0 ? [] : [ids.logo]);
	for (const [i, el] of [...document.querySelectorAll('[data-field-anchor="pill"]')].entries())
		rect(el, ids.pills[i] ?? []);
	return out;
}
