import type { EdgeDef, EdgeGeom, Style } from "./geometry.ts";
import type { VEl } from "./scene.ts";

/** A rectangle the field keeps clear of (the page's text): left, top, right, bottom in world units. */
export type Rect = [number, number, number, number];

export type View = { x: number; y: number; w: number; h: number };

/** A hero element that is also a node of the field (the logo, the two ends of a button). */
export type Anchor = {
	fixed: true;
	kind: "hero" | "cap";
	style: Style;
	x: number;
	y: number;
	R: number;
	ro: number;
	ri: number;
	pitch?: number;
	hole?: number;
	n?: number;
	a0?: number;
	partner?: number;
	pillLeft?: boolean;
};

export type SatTarget = { key: string; x: number; y: number };

/** What the page tells the field about itself when the field is built. */
export type Layout = {
	anchors: Anchor[];
	rects: Rect[];
	/** [satellite key, node id] pairs: a satellite joined to a button end when close enough. */
	bondSpec: [string, number][];
	satTargets: SatTarget[];
	view: View;
};

/** The drawn parts of one node. */
export type NodeEls = {
	ax1: VEl;
	ax2: VEl;
	cross: VEl;
	pitch?: VEl;
	boss: VEl;
	r1?: VEl;
	r2?: VEl;
	body?: VEl;
	bodyAxis?: VEl;
	holes: VEl[];
	kid: VEl[];
	cross2: VEl[];
	/** the arc a stretched node turns into: two rings and a construction arc, made when first needed */
	xa?: VEl;
	xb?: VEl;
	xc?: VEl;
	expOn?: boolean;
};

/** One frame (a group per layer) per node, so a moving node costs one transform write per layer. */
export type NodeGroups = { c: VEl; p: VEl; r: VEl; a: VEl };

/** The drawn parts of one web. */
export type EdgeEls = { cl: VEl; cp: VEl; o1: VEl; o2: VEl; sl: VEl; shown?: boolean };

export type NodeKind = "field" | "cap" | "hero" | "sat";
export type SizeClass = "xl" | "l" | "m" | "s" | "";

export type FieldNode = {
	id: number;
	hx: number;
	hy: number;
	x: number;
	y: number;
	R: number;
	ro: number;
	ri: number;
	style: Style;
	pitch: number | undefined;
	hole: number | undefined;
	nh: number | undefined;
	a0: number;
	cap: number;
	ax: number;
	ay: number;
	wx1: number;
	wx2: number;
	wy1: number;
	wy2: number;
	px1: number;
	px2: number;
	py1: number;
	py2: number;
	ox: number;
	oy: number;
	qx: number;
	qy: number;
	qvx: number;
	qvy: number;
	ptx: number;
	pty: number;
	ang: number;
	vel: number;
	tgt: number;
	next: number;
	kick: number;
	breathe: number;
	pulse: number;
	hot: number;
	vis: number;
	kx: number;
	ky: number;
	kvx: number;
	kvy: number;
	expU: number;
	expDir: number;
	host: number;
	expNext: number;
	expUntil: number;
	lenCur: number;
	feas: number;
	chainSpin: number;
	cls: SizeClass;
	fixed: boolean;
	kind: NodeKind;
	partner: number;
	pillLeft: boolean;
	extraHot: number;
	els: NodeEls | null;
	step: number;
	ng?: NodeGroups;
	n0?: { x: number; y: number; R: number };
	inChain?: boolean;
	/** how much of the node the entrance has drawn (undefined: all) */
	penV?: number;
	fade0?: number;
};

export type EdgeSpec = {
	type: EdgeDef["type"];
	rf: number;
	slot: EdgeDef["slot"];
	bonded: boolean;
};

export type FieldEdge = {
	i: number;
	j: number;
	ed: EdgeSpec;
	u: number;
	dir: number;
	c: number;
	near: boolean;
	onC: number;
	offC: number;
	g: EdgeGeom | null;
	els: EdgeEls | null;
	pulseP: number;
	pulseDir: number;
	prevU: number;
	glow: number;
	glowOn: boolean;
	lastProbe: number;
	blocked: boolean;
	gapNow?: number;
	fade0?: number;
};

/** The parts of the field's state that the layout reads and writes. */
export type LayoutState = {
	nodes: FieldNode[];
	edges: FieldEdge[];
	rects: Rect[];
	autoBonds: [number, number][] | null;
	/** satellite key -> node id */
	satIds: Record<string, number>;
	bonds: [number, number][];
};
