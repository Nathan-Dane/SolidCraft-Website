import { createScheduler, type Env, type Options, type Scheduler } from "./scheduler.ts";

/** What the page bindings use of the window and the document, so tests can stand in for them. */
export type PageLike = {
	window: Pick<EventTarget, "addEventListener" | "removeEventListener">;
	document: Pick<EventTarget, "addEventListener" | "removeEventListener"> & {
		readonly hidden: boolean;
	};
};

export function browserEnv(): Env {
	return {
		request: (callback) => requestAnimationFrame(callback),
		cancel: (id) => cancelAnimationFrame(id),
		now: () => performance.now(),
	};
}

/**
 * Connect a scheduler to the page: a hidden tab stops it, pointer and key events make it active, and scrolling makes it run
 * every frame for a moment. The listeners are passive and do nothing but note the event. Returns a function that disconnects.
 */
export function bindPage(scheduler: Scheduler, page: PageLike = { window, document }): () => void {
	const visibility = () => scheduler.setHidden(page.document.hidden);
	const poke = () => scheduler.poke();
	const scroll = () => scheduler.scroll();
	const passive = { passive: true } as const;
	page.document.addEventListener("visibilitychange", visibility);
	page.window.addEventListener("pointermove", poke, passive);
	page.window.addEventListener("pointerdown", poke, passive);
	page.window.addEventListener("keydown", poke, passive);
	page.window.addEventListener("scroll", scroll, passive);
	visibility();
	return () => {
		page.document.removeEventListener("visibilitychange", visibility);
		page.window.removeEventListener("pointermove", poke);
		page.window.removeEventListener("pointerdown", poke);
		page.window.removeEventListener("keydown", poke);
		page.window.removeEventListener("scroll", scroll);
	};
}

let shared: Scheduler | undefined;

/** The page's one scheduler, created and bound on first use. */
export function pageScheduler(options?: Options): Scheduler {
	if (!shared) {
		shared = createScheduler(browserEnv(), options);
		bindPage(shared);
	}
	return shared;
}
