export type Phase = "read" | "simulate" | "write";

const PHASES: readonly Phase[] = ["read", "simulate", "write"];

export type Frame = {
	/** The frame's timestamp, in milliseconds. */
	time: number;
	/** Seconds since the previous frame (0 on the first). */
	dt: number;
};

/** What a task returns: nothing to run again next frame, or "sleep" to stay out of the loop until it is woken. */
export type Result = "sleep" | undefined;

export type TaskOptions = {
	phase: Phase;
	run(frame: Frame): Result;
};

export type Task = {
	/** Put a sleeping task back in the loop (the frames start again if none was running). */
	wake(): void;
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
	type Entry = { phase: Phase; run(frame: Frame): Result; awake: boolean };
	const tasks: Entry[] = [];
	let handle = 0;
	let last: number | null = null;

	function frame(time: number): void {
		handle = 0;
		const dt = last === null ? 0 : Math.min((time - last) / 1000, MAX_DT);
		last = time;
		const current = { time, dt };
		for (const phase of PHASES) {
			for (const task of [...tasks]) {
				if (task.phase !== phase || !task.awake || !tasks.includes(task)) continue;
				if (task.run(current) === "sleep") task.awake = false;
			}
		}
		if (anyAwake()) handle = env.request(frame);
		else last = null; // a long sleep is not a long frame
	}

	function anyAwake(): boolean {
		return tasks.some((t) => t.awake);
	}

	function ensure(): void {
		if (handle === 0 && anyAwake()) handle = env.request(frame);
	}

	function settle(): void {
		if (handle !== 0 && !anyAwake()) {
			env.cancel(handle);
			handle = 0;
			last = null;
		}
	}

	return {
		add(options) {
			const task: Entry = { phase: options.phase, run: options.run, awake: true };
			tasks.push(task);
			ensure();
			return {
				wake() {
					if (!tasks.includes(task)) return;
					task.awake = true;
					ensure();
				},
				remove() {
					const i = tasks.indexOf(task);
					if (i >= 0) tasks.splice(i, 1);
					settle();
				},
			};
		},
	};
}
