import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeEnv } from "./fake.ts";
import { createScheduler } from "./scheduler.ts";

test("tasks run in the order of their phases, whatever order they were added in", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	const log: string[] = [];
	scheduler.add({ phase: "write", run: () => void log.push("write") });
	scheduler.add({ phase: "read", run: () => void log.push("read") });
	scheduler.add({ phase: "simulate", run: () => void log.push("simulate") });
	scheduler.add({ phase: "read", run: () => void log.push("read 2") });
	fake.step();
	assert.deepEqual(log, ["read", "read 2", "simulate", "write"]);
});

test("one frame is requested at a time, however many tasks there are", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	scheduler.add({ phase: "read", run() {} });
	scheduler.add({ phase: "write", run() {} });
	assert.equal(fake.pending, 1);
	fake.step();
	assert.equal(fake.pending, 1);
});

test("a task sees the time since the last frame, in seconds, and never more than 50 ms", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	const seen: number[] = [];
	scheduler.add({ phase: "simulate", run: (f) => void seen.push(f.dt) });
	fake.step(16);
	fake.step(16);
	fake.step(400);
	assert.equal(seen[0], 0);
	assert.ok(Math.abs((seen[1] ?? 0) - 0.016) < 1e-9);
	assert.equal(seen[2], 0.05);
});

test("removing the last task stops the frames", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	const task = scheduler.add({ phase: "read", run() {} });
	task.remove();
	assert.equal(fake.pending, 0);
});

test("a task removed during a frame does not run again that frame", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	const log: string[] = [];
	const second = scheduler.add({ phase: "write", run: () => void log.push("second") });
	scheduler.add({
		phase: "read",
		run: () => {
			log.push("first");
			second.remove();
		},
	});
	fake.step();
	assert.deepEqual(log, ["first"]);
});

test("a task that sleeps leaves the loop, and no frames are requested when all are asleep", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	let runs = 0;
	scheduler.add({
		phase: "write",
		run: () => {
			runs++;
			return "sleep";
		},
	});
	fake.step();
	assert.equal(runs, 1);
	assert.equal(fake.pending, 0);
	assert.equal(fake.step(), false);
});

test("waking a sleeping task starts the frames again", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	let runs = 0;
	const task = scheduler.add({
		phase: "write",
		run: () => {
			runs++;
			return "sleep";
		},
	});
	fake.step();
	task.wake();
	assert.equal(fake.pending, 1);
	fake.step();
	assert.equal(runs, 2);
	assert.equal(fake.pending, 0);
});

test("a sleeping task does not hold the loop for the others", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	const log: string[] = [];
	scheduler.add({
		phase: "read",
		run: () => {
			log.push("sleeper");
			return "sleep";
		},
	});
	scheduler.add({ phase: "write", run: () => void log.push("busy") });
	fake.step();
	fake.step();
	assert.deepEqual(log, ["sleeper", "busy", "busy"]);
});

test("after a sleep the first frame does not see the whole sleep as elapsed time", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	const seen: number[] = [];
	const task = scheduler.add({
		phase: "simulate",
		run: (f) => {
			seen.push(f.dt);
			return "sleep";
		},
	});
	fake.step(16);
	task.wake();
	fake.step(5000);
	assert.equal(seen[1], 0);
});

test("a task can wake itself from inside a frame by returning nothing", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	let runs = 0;
	scheduler.add({ phase: "read", run: () => void runs++ });
	fake.step();
	fake.step();
	assert.equal(runs, 2);
	assert.equal(fake.pending, 1);
});

// run for one second of 60 Hz frames and count how often a task ran
function runsPerSecond(
	rate: "frame" | "policy",
	prepare: (s: ReturnType<typeof createScheduler>) => void,
): number {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	let runs = 0;
	scheduler.add({ phase: "simulate", rate, run: () => void runs++ });
	prepare(scheduler);
	for (let i = 0; i < 60; i++) fake.step(1000 / 60);
	return runs;
}

test("a policy task runs about 20 times a second when the visitor is idle", () => {
	const n = runsPerSecond("policy", () => {});
	assert.ok(n >= 19 && n <= 21, `ran ${n} times`);
});

test("a policy task runs about 30 times a second while the visitor is active", () => {
	const n = runsPerSecond("policy", (s) => s.poke());
	assert.ok(n >= 29 && n <= 31, `ran ${n} times`);
});

test("a policy task runs every frame while the page scrolls", () => {
	const n = runsPerSecond("policy", (s) => {
		s.poke();
		s.scroll();
	});
	// scrolling holds for 160 ms, then the active rate takes over
	assert.ok(n >= 32 && n <= 42, `ran ${n} times`);
});

test("a frame task is not slowed by the policy", () => {
	assert.equal(
		runsPerSecond("frame", () => {}),
		60,
	);
});

test("activity wears off: the pace returns to idle after the hold", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	scheduler.poke();
	assert.equal(scheduler.mode, "active");
	fake.step(2001);
	assert.equal(scheduler.mode, "idle");
	scheduler.scroll();
	assert.equal(scheduler.mode, "scroll");
});

test("a hidden tab runs nothing and requests no frame, and resumes when shown", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	let runs = 0;
	scheduler.add({ phase: "read", run: () => void runs++ });
	fake.step();
	scheduler.setHidden(true);
	assert.equal(fake.pending, 0);
	assert.equal(runs, 1);
	scheduler.setHidden(false);
	assert.equal(fake.pending, 1);
	fake.step();
	assert.equal(runs, 2);
});

test("a task that is not visible is not run and keeps no frames going", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	let runs = 0;
	const task = scheduler.add({ phase: "read", run: () => void runs++ });
	task.setVisible(false);
	assert.equal(fake.pending, 0);
	task.setVisible(true);
	assert.equal(fake.pending, 1);
	fake.step();
	assert.equal(runs, 1);
});

test("other tasks keep running while one is not visible", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	const log: string[] = [];
	const hidden = scheduler.add({ phase: "read", run: () => void log.push("hidden") });
	scheduler.add({ phase: "write", run: () => void log.push("shown") });
	hidden.setVisible(false);
	fake.step();
	assert.deepEqual(log, ["shown"]);
});
