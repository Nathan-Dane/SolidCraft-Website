import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeEnv } from "./fake.ts";
import { bindPage, type PageLike } from "./page.ts";
import { createScheduler } from "./scheduler.ts";

function fakePage() {
	const window = new EventTarget();
	const document = Object.assign(new EventTarget(), { hidden: false });
	const page: PageLike = { window, document };
	return { page, window, document };
}

test("scrolling and activity on the page reach the scheduler", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	const { page, window } = fakePage();
	bindPage(scheduler, page);
	assert.equal(scheduler.mode, "idle");
	window.dispatchEvent(new Event("pointermove"));
	assert.equal(scheduler.mode, "active");
	window.dispatchEvent(new Event("scroll"));
	assert.equal(scheduler.mode, "scroll");
});

test("a hidden tab stops the frames and showing it starts them again", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	scheduler.add({ phase: "read", run() {} });
	const { page, document } = fakePage();
	bindPage(scheduler, page);
	document.hidden = true;
	document.dispatchEvent(new Event("visibilitychange"));
	assert.equal(fake.pending, 0);
	document.hidden = false;
	document.dispatchEvent(new Event("visibilitychange"));
	assert.equal(fake.pending, 1);
});

test("a page that starts hidden does not request frames", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	const { page, document } = fakePage();
	document.hidden = true;
	bindPage(scheduler, page);
	scheduler.add({ phase: "read", run() {} });
	assert.equal(fake.pending, 0);
});

test("after disconnecting, the page no longer reaches the scheduler", () => {
	const fake = fakeEnv();
	const scheduler = createScheduler(fake.env);
	const { page, window } = fakePage();
	const unbind = bindPage(scheduler, page);
	unbind();
	window.dispatchEvent(new Event("keydown"));
	assert.equal(scheduler.mode, "idle");
});
