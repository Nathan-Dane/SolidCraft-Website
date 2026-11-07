import { MASTER } from "./geometry.ts";
import { VEl } from "./scene.ts";
import type { FieldEdge, LayoutState, View } from "./types.ts";

export type Rand = () => number;

export type GroupId =
	| "shared-construction"
	| "tangent-connected-profiles"
	| "concentric-bearing-families"
	| "integrated-apertures"
	| "related-dimensions";

/** The drawing layers, bottom to top. */
export const GROUP_ORDER: readonly GroupId[] = [
	"shared-construction",
	"tangent-connected-profiles",
	"concentric-bearing-families",
	"integrated-apertures",
	"related-dimensions",
];

/** A belt wrapped round two or three nodes. */
export type Chain = {
	ids: number[];
	u: number;
	dir: number;
	born: number;
	life: number;
	phase: number;
	g: VEl;
	links: VEl;
	pin: VEl;
};

/** Something that happens at a time: a pulse entering a web, or a node being struck. */
export type Fire =
	| { at: number; kind: "edge"; e: FieldEdge; dir: number }
	| { at: number; kind: "node"; id: number; dir: number; soft?: boolean };

export type LabelKind = "bore" | "span" | "radius" | "length" | "angle";

export type LabelText = { g: VEl; str: string; n: number; uses: VEl[] };

export type LabelGeo = {
	lines: string;
	arrows: string;
	text: { x: number; y: number; rot: number; str: string; op: number; flip?: number };
	pts: number[];
	tpts: number[];
	cx: number;
	cy: number;
	seg?: number[];
};

/** What a label is about: the node (a), the web (e), which side, and so on, by kind. */
export type LabelSpec = {
	a?: number;
	e?: number;
	e1?: number;
	e2?: number;
	side?: number;
	shift?: number;
	dirY?: number;
	hold?: boolean;
	keyPart?: string | number;
};

export type Label = LabelSpec & {
	kind: LabelKind;
	g: VEl;
	prog: number;
	dir: number;
	born: number;
	life: number;
	bad: number;
	lines: VEl;
	arrows: VEl;
	txt: LabelText;
	lastTxt: number;
	bbox: number[] | null;
	geo: LabelGeo | null;
	hold: boolean;
	key: string;
	flash?: number;
};

export type State = LayoutState & {
	t: number;
	labels: Label[];
	amp: number;
	hover: number;
	view: View;
	running: boolean;
	built: boolean;
	evalAcc: number;
	labelAcc: number;
	lastSpawn: number;
	chains: Chain[];
	nextChain: number;
	/** how far the page has scrolled, in world units */
	scroll: number;
	/** the field's nodes scroll at this fraction of the page's speed; the anchored hero nodes scroll with the page */
	parK: number;
	fires: Fire[];
	maxLabels: number;
	caps: { bore: number; span: number; radius: number; length: number; angle: number };
	onrender: (() => void) | null;
	fastUntil: number;
	/** entrance: webs, belts, details and labels wait until the nodes have been drawn */
	introHold: boolean;
	scrollUntil: number;
	idleHz: number;
	activeHz: number;
	dtLast?: number;
	nFrames?: number;
	nSteps?: number;
	error?: string;
};

/** Everything the simulation's parts share. */
export type Sim = {
	S: State;
	rand: Rand;
	GR: Record<GroupId, VEl>;
	/** when each label was last made, by key */
	seen: Record<string, number>;
};

export function createState(maxLabels: number): State {
	return {
		t: 0,
		nodes: [],
		edges: [],
		labels: [],
		amp: 0,
		hover: -1,
		view: { x: 0, y: 0, w: MASTER.W, h: MASTER.H },
		running: false,
		built: false,
		evalAcc: 0,
		labelAcc: 0,
		lastSpawn: -10,
		chains: [],
		nextChain: 6,
		scroll: 0,
		parK: 0.5,
		fires: [],
		maxLabels,
		caps: { bore: 3, span: 2, radius: 3, length: 2, angle: 1 },
		onrender: null,
		rects: [],
		fastUntil: 0,
		introHold: false,
		scrollUntil: 0,
		idleHz: 20,
		activeHz: 30,
		autoBonds: null,
		satIds: {},
		bonds: [],
	};
}

export function createGroups(): Record<GroupId, VEl> {
	return Object.fromEntries(GROUP_ORDER.map((id) => [id, new VEl("g")])) as Record<GroupId, VEl>;
}

/** The direction a button end faces: toward the other end of its button. */
export function capAngle(S: State, n: { partner: number; x: number; y: number }): number {
	const p = S.nodes[n.partner];
	if (!p) return 0;
	return Math.atan2(p.y - n.y, p.x - n.x);
}

/** Is a point inside the view, by a margin? */
export function inView(S: State, x: number, y: number, m: number): boolean {
	const v = S.view;
	return x > v.x + m && x < v.x + v.w - m && y > v.y + m && y < v.y + v.h - m;
}
