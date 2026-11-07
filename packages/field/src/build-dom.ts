/** Creating the drawn parts of the nodes and the webs. */
import { COL } from "./palette.ts";
import { type Attrs, VEl } from "./scene.ts";
import type { Sim } from "./sim.ts";
import type { EdgeEls, FieldEdge, FieldNode, NodeEls } from "./types.ts";

export function el(name: VEl["name"], attrs: Attrs | null, parent?: VEl): VEl {
	const e = new VEl(name, attrs);
	if (parent) parent.appendChild(e);
	return e;
}

const ROUND = { "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" } as const;

/** Attributes of a stroked part: round ends, no fill, and the given ones. */
function attrs(o: Attrs): Attrs {
	return { ...ROUND, ...o };
}

function nodeEls(n: FieldNode, NG: NonNullable<FieldNode["ng"]>): NodeEls {
	const holes: VEl[] = [];
	const kid: VEl[] = [];
	const cross2: VEl[] = [];
	const ax1 = el(
		"path",
		attrs({ stroke: COL.axis, "stroke-width": 1.05, opacity: 0.6, "stroke-dasharray": "22 7 2 7" }),
		NG.c,
	);
	const ax2 = el(
		"path",
		attrs({ stroke: COL.axis, "stroke-width": 1.05, opacity: 0.6, "stroke-dasharray": "22 7 2 7" }),
		NG.c,
	);
	const cross = el("path", attrs({ stroke: COL.cross, "stroke-width": 1.1, opacity: 0.6 }), NG.c);
	const e: NodeEls = { ax1, ax2, cross, boss: undefined as unknown as VEl, holes, kid, cross2 };
	if (n.style !== "plain") {
		e.pitch = el(
			"circle",
			attrs({
				r: n.pitch ?? 0,
				stroke: COL.pitch,
				"stroke-width": 1,
				opacity: 0.65,
				"stroke-dasharray": "16 6 2 6",
			}),
			NG.c,
		);
	}
	cross.setAttribute("d", "M-10 0H10M0 -10V10");
	e.boss = el("path", attrs({ stroke: COL.outline, "stroke-width": 2.4, opacity: 0.8 }), NG.p);
	if (n.ro > 0)
		e.r1 = el(
			"circle",
			attrs({ r: n.ro, stroke: COL.ring, "stroke-width": 2, opacity: 0.79 }),
			NG.r,
		);
	if (n.ri > 0)
		e.r2 = el(
			"circle",
			attrs({ r: n.ri, stroke: COL.ring, "stroke-width": 2, opacity: 0.79 }),
			NG.r,
		);
	if (n.pillLeft) {
		e.body = el("path", attrs({ stroke: COL.outline, "stroke-width": 2.4, opacity: 0.8 }), NG.p);
		e.bodyAxis = el(
			"path",
			attrs({
				stroke: COL.axis,
				"stroke-width": 1.05,
				opacity: 0.6,
				"stroke-dasharray": "22 7 2 7",
			}),
			NG.c,
		);
	}
	if (n.style === "holes") {
		for (let k = 0; k < (n.nh ?? 0); k++) {
			holes.push(
				el(
					"circle",
					attrs({ r: n.hole ?? 0, stroke: COL.ring, "stroke-width": 1.7, opacity: 0.8 }),
					NG.a,
				),
			);
			cross2.push(
				el("path", attrs({ stroke: COL.cross, "stroke-width": 1.1, opacity: 0.6 }), NG.c),
			);
		}
	} else if (n.style === "kidney") {
		for (let q = 0; q < 3; q++)
			kid.push(el("path", attrs({ stroke: COL.ring, "stroke-width": 1.9, opacity: 0.8 }), NG.a));
	}
	return e;
}

export function buildDom({ S, GR }: Sim): void {
	for (const id of Object.keys(GR) as (keyof typeof GR)[]) GR[id].clear();
	for (const n of S.nodes) {
		// each node's parts live in a local frame (a group per layer), so a moving node costs one transform write per layer
		const NG = {
			c: el("g", null, GR["shared-construction"]),
			p: el("g", null, GR["tangent-connected-profiles"]),
			r: el("g", null, GR["concentric-bearing-families"]),
			a: el("g", null, GR["integrated-apertures"]),
		};
		n.ng = NG;
		n.n0 = { x: 0, y: 0, R: n.R };
		n.els = nodeEls(n, NG);
	}
	for (const e of S.edges) e.els = null;
}

/** The drawn parts of a web, made the first time it is shown. */
export function edgeEls({ GR }: Sim, e: FieldEdge): EdgeEls {
	if (e.els) return e.els;
	const o: EdgeEls = {
		cl: el(
			"path",
			attrs({ stroke: COL.cons, "stroke-width": 1.05, opacity: 0, "stroke-dasharray": "22 7 2 7" }),
			GR["shared-construction"],
		),
		cp: el(
			"path",
			attrs({ stroke: COL.hot, "stroke-width": 1.6, opacity: 0, pathLength: 1 }),
			GR["shared-construction"],
		),
		o1: el(
			"path",
			attrs({ stroke: COL.outline, "stroke-width": 2.4, opacity: 0.8, pathLength: 1 }),
			GR["tangent-connected-profiles"],
		),
		o2: el(
			"path",
			attrs({ stroke: COL.outline, "stroke-width": 2.4, opacity: 0.8, pathLength: 1 }),
			GR["tangent-connected-profiles"],
		),
		sl: el(
			"path",
			attrs({ stroke: COL.slot, "stroke-width": 1.6, opacity: 0.7 }),
			GR["integrated-apertures"],
		),
	};
	e.els = o;
	return o;
}
