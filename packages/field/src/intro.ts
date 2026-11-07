/*
 * The entrance. The page starts blank; once the site has settled, the logo's node is drawn first along its outlines like a pen,
 * the logo and the buttons appear with their nodes, then the text, and the rest of the nodes follow, nearest the logo first.
 * The webs grow last. Scrolling ends it at once: what is drawn stays, the rest fades in.
 *
 *   waiting    nothing shows; the machine watches for the site to settle (loaded, and a run of steady frames)
 *   playing    the timeline below runs
 *   released   the nodes are drawn and the webs grow; the entrance is over in a moment
 *   skipping   it was cut short: everything is in its finished state and fading in
 *   done
 *
 * The machine knows the field and a clock, not the page: the page's parts are revealed through `effects`.
 */
import { easeInOut } from "./math.ts";

export type Stage = "datum" | "logo" | "pills" | "title" | "bar" | "tag" | "meta" | "cue";

export type IntroState = "waiting" | "playing" | "released" | "skipping" | "done";

/** What the entrance does to the page. */
export type IntroEffects = {
	/** A part of the page appears (each stage once). */
	stage(stage: Stage): void;
	/** A satellite's node is nearly drawn, so its icon appears. */
	satellite(key: string): void;
	/** The entrance is over, finished or cut short; what it hid is shown from here (a skipped one is still fading). */
	ended(skipped: boolean): void;
};

/** The timeline, in milliseconds from the moment the entrance starts playing. */
export const TIMELINE = {
	/** The logo's node is drawn first, over this long. */
	logo: { at: 0, duration: 900 },
	/** The buttons' nodes: the first starts here and each next one a little later. */
	pills: { at: 600, step: 100, duration: 800 },
	/** The other nodes, nearest the logo first. */
	others: { at: 800, step: 45, duration: 1000 },
	/** When each part of the page appears. */
	stages: [
		["logo", 600],
		["pills", 650],
		["title", 950],
		["bar", 1100],
		["tag", 1150],
		["meta", 1300],
		["cue", 1450],
	] as const,
	/** A satellite's icon appears once its node is this far drawn. */
	satellite: 0.7,
	/** The webs start to grow this long before the last node is finished, and the entrance ends this long after it. */
	releaseBefore: 150,
	endAfter: 1100,
	/** With no other nodes, the last one is taken to finish here. */
	empty: 2000,
	/** Playing starts a moment after the decision, so the first frame is drawn blank. */
	lead: 80,
	/** The fade that follows a skip. */
	fade: 700,
} as const;

/** The site is settled when the page is loaded and `steady` frames in a row were at most `gap` apart, within these limits. */
export const SETTLE = { min: 450, max: 3500, steady: 12, gap: 36 } as const;

/** Scrolling further than this ends the entrance. */
export const SKIP_SCROLL = 40;

export type IntroNode = { id: number; x: number; y: number };

/** The slice of the field the entrance drives. */
export type IntroField = {
	state: { nodes: IntroNode[] };
	satIds(): Record<string, number>;
	introBegin(): void;
	introEnd(): void;
	introFinish(): void;
	setPen(id: number, p: number): void;
	setFade(t: number): void;
};

/** The node ids of the logo and of each button's ends. */
export type IntroIds = { logo: number; pills: readonly (readonly number[])[] };

export type Plan = {
	/** The other nodes with the time each starts, nearest the logo first. */
	others: { id: number; at: number }[];
	releaseAt: number;
	endAt: number;
};

/** Which nodes start when. Pure: the same nodes give the same plan. */
export function plan(nodes: readonly IntroNode[], ids: IntroIds): Plan {
	const anchored = new Set<number>([ids.logo, ...ids.pills.flat()]);
	const logo = nodes[ids.logo];
	const others = nodes
		.filter((n) => !anchored.has(n.id))
		.map((n) => ({ id: n.id, d: logo ? Math.hypot(n.x - logo.x, n.y - logo.y) : 0 }))
		.sort((a, b) => a.d - b.d)
		.map((n, i) => ({ id: n.id, at: TIMELINE.others.at + i * TIMELINE.others.step }));
	const last = others.length
		? (others[others.length - 1]?.at ?? 0) + TIMELINE.others.duration
		: TIMELINE.empty;
	return {
		others,
		releaseAt: last - TIMELINE.releaseBefore,
		endAt: last + TIMELINE.endAfter,
	};
}

export type Intro = {
	readonly state: IntroState;
	/** True until the entrance, and the fade after a skip, are over. */
	readonly busy: boolean;
	/** Call every frame with the frame's time (ms) and the page's scroll position. */
	tick(now: number, scroll: number): void;
	/** The page was laid out again and the field rebuilt: carry on with the new nodes. */
	rebuilt(): void;
	/** End it now without a fade (the live field is gone, or the page was left). */
	cancel(): void;
};

/** Starts the entrance's waiting state; the field's nodes are undrawn from here. `born` is the clock's time now. */
export function createIntro(
	field: IntroField,
	ids: () => IntroIds,
	effects: IntroEffects,
	born: number,
	loaded: () => boolean = () => document.readyState === "complete",
): Intro {
	let state: IntroState = "waiting";
	let current = plan(field.state.nodes, ids());
	let keyOf = satelliteKeys();
	let start = 0;
	let previous = 0;
	let steady = 0;
	let fadeFrom = 0;
	let released = false;
	const staged = new Set<Stage>();
	const shownSats = new Set<string>();

	const stage = (s: Stage): void => {
		if (staged.has(s)) return;
		staged.add(s);
		effects.stage(s);
	};
	const satellite = (key: string): void => {
		if (shownSats.has(key)) return;
		shownSats.add(key);
		effects.satellite(key);
	};

	field.introBegin();

	function satelliteKeys(): Map<number, string> {
		return new Map(Object.entries(field.satIds()).map(([key, id]) => [id, key]));
	}

	function finish(skipped: boolean): void {
		field.introEnd();
		state = skipped ? "skipping" : "done";
		effects.ended(skipped);
	}

	function skip(now: number): void {
		field.introFinish();
		for (const [s] of TIMELINE.stages) stage(s);
		stage("datum");
		for (const key of Object.keys(field.satIds())) satellite(key);
		state = "skipping";
		fadeFrom = now;
		effects.ended(true);
	}

	function play(t: number): void {
		const { logo, pills } = ids();
		field.setPen(logo, easeInOut((t - TIMELINE.logo.at) / TIMELINE.logo.duration));
		if (t >= TIMELINE.pills.at) {
			for (const [i, ends] of pills.entries()) {
				const p = easeInOut(
					(t - TIMELINE.pills.at - i * TIMELINE.pills.step) / TIMELINE.pills.duration,
				);
				for (const id of ends) field.setPen(id, p);
			}
		}
		for (const [s, at] of TIMELINE.stages) if (t >= at) stage(s);
		for (const n of current.others) {
			if (t < n.at) continue;
			const p = easeInOut((t - n.at) / TIMELINE.others.duration);
			field.setPen(n.id, p);
			const key = keyOf.get(n.id);
			if (key && p > TIMELINE.satellite) satellite(key);
		}
		if (t >= current.releaseAt && !released) {
			released = true;
			state = "released";
			field.introEnd(); // the webs start to grow
		}
		if (t >= current.endAt) finish(false);
	}

	return {
		get state() {
			return state;
		},
		get busy() {
			return state !== "done";
		},

		tick(now, scroll) {
			if (state === "done") return;
			if (state === "skipping") {
				const k = (now - fadeFrom) / TIMELINE.fade;
				field.setFade(easeInOut(k));
				if (k >= 1) state = "done";
				return;
			}
			if (scroll > SKIP_SCROLL) {
				skip(now);
				return;
			}
			if (state === "waiting") {
				const gap = previous ? now - previous : 0;
				previous = now;
				steady = gap > 0 && gap < SETTLE.gap ? steady + 1 : 0;
				const waited = now - born;
				const ready = loaded() && steady >= SETTLE.steady && waited > SETTLE.min;
				if (ready || waited > SETTLE.max) {
					state = "playing";
					start = now + TIMELINE.lead;
					stage("datum");
				}
				return;
			}
			const t = now - start;
			if (t >= 0) play(t);
		},

		rebuilt() {
			if (state === "done" || state === "skipping") return;
			if (released) {
				finish(false);
				return;
			}
			current = plan(field.state.nodes, ids());
			keyOf = satelliteKeys();
			field.introBegin();
		},

		cancel() {
			if (state === "done") return;
			const wasSkipping = state === "skipping";
			field.introEnd();
			state = "done";
			if (!wasSkipping) effects.ended(false);
		},
	};
}
