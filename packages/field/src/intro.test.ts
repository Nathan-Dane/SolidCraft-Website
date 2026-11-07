import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createIntro,
	type IntroEffects,
	type IntroField,
	type IntroIds,
	plan,
	SETTLE,
	SKIP_SCROLL,
	type Stage,
	TIMELINE,
} from "./intro.ts";

// ids: 0 logo, 1-2 first button, 3-4 second button, 5.. others (5 and 6 are satellites)
const nodes = Array.from({ length: 12 }, (_, id) => ({
	id,
	x: id === 0 ? 0 : (12 - id) * 10,
	y: 0,
}));
const ids: IntroIds = {
	logo: 0,
	pills: [
		[1, 2],
		[3, 4],
	],
};

function rig(loaded = true) {
	const calls: string[] = [];
	const pens = new Map<number, number>();
	const field: IntroField = {
		state: { nodes },
		satIds: () => ({ plugins: 5, agents: 6 }),
		introBegin: () => {
			calls.push("begin");
			pens.clear();
		},
		introEnd: () => calls.push("end"),
		introFinish: () => calls.push("finish"),
		setPen: (id, p) => pens.set(id, p),
		setFade: (t) => calls.push(`fade ${t.toFixed(2)}`),
	};
	const stages: [Stage, number][] = [];
	const sats: [string, number][] = [];
	let clock = 0;
	const effects: IntroEffects = {
		stage: (s) => stages.push([s, clock]),
		satellite: (k) => sats.push([k, clock]),
		ended: (skipped) => calls.push(skipped ? "ended skipped" : "ended"),
	};
	const intro = createIntro(
		field,
		() => ids,
		effects,
		0,
		() => loaded,
	);
	/** Run frames of 16 ms up to `until` ms. */
	const run = (until: number, scroll = 0) => {
		while (clock + 16 <= until) {
			clock += 16;
			intro.tick(clock, scroll);
		}
	};
	return { intro, calls, pens, stages, sats, run, field };
}

test("the plan orders the other nodes nearest the logo first, 45 ms apart", () => {
	const p = plan(nodes, ids);
	assert.equal(p.others.length, 7);
	assert.deepEqual(
		p.others.map((n) => n.id),
		[11, 10, 9, 8, 7, 6, 5],
	);
	assert.equal(p.others[0]?.at, 800);
	assert.equal(p.others[6]?.at, 800 + 6 * 45);
	assert.equal(p.endAt, 800 + 6 * 45 + 1000 + 1100);
	assert.equal(p.releaseAt, 800 + 6 * 45 + 1000 - 150);
});

test("nothing is drawn while the entrance waits", () => {
	const { run, calls, stages } = rig();
	run(300);
	assert.deepEqual(calls, ["begin"]);
	assert.deepEqual(stages, []);
});

test("it starts after the minimum wait once the frames are steady", () => {
	const { run, stages, intro } = rig();
	run(SETTLE.min);
	assert.equal(intro.state, "waiting");
	run(SETTLE.min + 100);
	assert.equal(intro.state, "playing");
	assert.equal(stages[0]?.[0], "datum");
});

test("a page that is still loading, or janky frames, hold the start back until the limit", () => {
	const { run, intro } = rig(false);
	run(SETTLE.max - 20);
	assert.equal(intro.state, "waiting");
	run(SETTLE.max + 40);
	assert.equal(intro.state, "playing");
});

test("long frames restart the count of steady ones", () => {
	const { intro } = rig();
	let t = 0;
	const frame = (gap: number) => {
		t += gap;
		intro.tick(t, 0);
	};
	for (let i = 0; i < 30; i++) frame(100); // never steady, and within the limit
	assert.equal(intro.state, "waiting");
	for (let i = 0; i < SETTLE.steady + 1; i++) frame(16);
	assert.equal(intro.state, "playing");
});

test("the parts appear at their times, each once, and the webs are held back until the release", () => {
	const { run, stages, calls, intro, sats } = rig();
	run(7000);
	const names = stages.map(([s]) => s);
	assert.deepEqual(names, ["datum", "logo", "pills", "title", "bar", "tag", "meta", "cue"]);
	const at = new Map(stages);
	const base = at.get("datum") as number;
	for (const [s, ms] of TIMELINE.stages)
		assert.ok(Math.abs((at.get(s) as number) - base - ms) < 120, `${s} at ${ms}`);
	assert.deepEqual(sats.map(([k]) => k).sort(), ["agents", "plugins"]);
	assert.ok(calls.indexOf("end") > 0 && calls.indexOf("ended") > calls.indexOf("end"));
	assert.equal(intro.state, "done");
	assert.equal(intro.busy, false);
});

test("pens follow the timeline: the logo first, the buttons next, the rest in order", () => {
	const { run, pens } = rig();
	run(SETTLE.min + 80 + 16 * 3); // just after it starts
	assert.ok((pens.get(0) ?? 0) < 0.2);
	assert.equal(pens.get(11), undefined);
	run(5000);
	assert.equal(pens.get(0), 1);
	assert.equal(pens.get(1), 1);
	assert.equal(pens.get(5), 1);
});

test("scrolling ends it: the field is finished and fades in, and the parts are all shown", () => {
	const { run, calls, stages, intro, sats } = rig();
	run(SETTLE.min + 300);
	assert.equal(intro.state, "playing");
	run(SETTLE.min + 400, SKIP_SCROLL + 1);
	assert.equal(intro.state, "skipping");
	assert.ok(calls.includes("finish") && calls.includes("ended skipped"));
	assert.equal(new Set(stages.map(([s]) => s)).size, 8);
	assert.equal(sats.length, 2);
	run(SETTLE.min + 400 + TIMELINE.fade + 100, SKIP_SCROLL + 1);
	assert.equal(intro.state, "done");
	assert.ok(calls.some((c) => c === "fade 1.00"));
});

test("scrolling a little does not end it", () => {
	const { run, intro } = rig();
	run(SETTLE.min + 300, SKIP_SCROLL);
	assert.equal(intro.state, "playing");
});

test("a rebuild before the release starts the drawing over with the new nodes", () => {
	const { run, calls, intro, pens } = rig();
	run(SETTLE.min + 500);
	assert.ok(pens.size > 0);
	intro.rebuilt();
	assert.equal(calls.filter((c) => c === "begin").length, 2);
	assert.equal(pens.size, 0);
	assert.equal(intro.state, "playing");
});

test("a rebuild after the release ends it", () => {
	const { run, calls, intro } = rig();
	const { releaseAt } = plan(nodes, ids);
	run(SETTLE.min + 80 + releaseAt + 100);
	assert.equal(intro.state, "released");
	intro.rebuilt();
	assert.equal(intro.state, "done");
	assert.ok(calls.includes("ended"));
});

test("cancelling ends it without a fade, and does so once", () => {
	const { run, calls, intro } = rig();
	run(200);
	intro.cancel();
	intro.cancel();
	assert.equal(intro.state, "done");
	assert.equal(calls.filter((c) => c === "ended").length, 1);
});
