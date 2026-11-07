import { publishField } from "../lib/field-state";

// The field behind the hero. It is only loaded on pages that have one, as its own chunk.
if (document.querySelector('[data-field-anchor="logo"]')) {
	const query = new URLSearchParams(location.search);
	const backdrop = document.querySelector<HTMLElement>(".backdrop");
	const canvas = document.querySelector<HTMLCanvasElement>(".field-canvas");
	if (backdrop && canvas) {
		const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches && !query.has("motion");
		Promise.all([import("@solidcraft/frame"), import("@solidcraft/field")])
			.then(([frame, field]) =>
				field.startHost({
					backdrop,
					canvas,
					scheduler: frame.pageScheduler(),
					seed: Number(query.get("seed")) || 20,
					reduced,
					allowSoftware: query.get("gl") === "software",
				}),
			)
			.then((host) => {
				publishField(host);
				// ?debug: the host is reachable from the console (and from the tests)
				if (query.has("debug")) (window as unknown as { fieldHost: unknown }).fieldHost = host;
			})
			.catch((err: unknown) => {
				console.warn("The field is off:", err);
				document.documentElement.classList.add("poster-on");
			});
	}
}
