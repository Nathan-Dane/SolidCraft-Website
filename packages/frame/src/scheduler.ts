export type Phase = "read" | "simulate" | "write";

const PHASES: readonly Phase[] = ["read", "simulate", "write"];

export type Frame = {
	/** The frame's timestamp, in milliseconds. */
	time: number;
	/** Seconds since the previous frame (0 on the first). */
	dt: number;
};

export type TaskOptions = {
	phase: Phase;
	run(frame: Frame): void;
};

export type Task = {
	remove(): void;
};

/** The browser services the scheduler needs; tests pass their own. */
export type Env = {
	request(callback: (time: number) => void): number;
	cancel(id: number): void;
};

export type Scheduler = {
	add(options: TaskOptions): Task;
};

const MAX_DT = 0.05;

export function createScheduler(env: Env): Scheduler {
	const tasks: { phase: Phase; run(frame: Frame): void }[] = [];
	let handle = 0;
	let last: number | null = null;

	function frame(time: number): void {
		handle = 0;
		const dt = last === null ? 0 : Math.min((time - last) / 1000, MAX_DT);
		last = time;
		const current = { time, dt };
		for (const phase of PHASES) {
			for (const task of [...tasks]) {
				if (task.phase === phase && tasks.includes(task)) task.run(current);
			}
		}
		if (tasks.length > 0) handle = env.request(frame);
	}

	return {
		add(options) {
			const task = { phase: options.phase, run: options.run };
			tasks.push(task);
			if (handle === 0) handle = env.request(frame);
			return {
				remove() {
					const i = tasks.indexOf(task);
					if (i >= 0) tasks.splice(i, 1);
					if (tasks.length === 0 && handle !== 0) {
						env.cancel(handle);
						handle = 0;
						last = null;
					}
				},
			};
		},
	};
}
