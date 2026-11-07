import type { Env } from "./scheduler.ts";

/** A clock and frame queue that tests step by hand. */
export function fakeEnv() {
	let now = 0;
	let nextId = 1;
	const queue = new Map<number, (time: number) => void>();
	const env: Env = {
		request(callback) {
			const id = nextId++;
			queue.set(id, callback);
			return id;
		},
		cancel(id) {
			queue.delete(id);
		},
		now() {
			return now;
		},
	};
	return {
		env,
		/** Frames waiting to run. */
		get pending() {
			return queue.size;
		},
		/** Advance the clock by `ms` and run the frame that was waiting, if any. */
		step(ms = 1000 / 60) {
			now += ms;
			const [first] = queue;
			if (!first) return false;
			queue.delete(first[0]);
			first[1](now);
			return true;
		},
		get now() {
			return now;
		},
	};
}
