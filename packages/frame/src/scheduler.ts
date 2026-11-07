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
	/**
	 * "frame" (the default) runs every display frame. "policy" runs at the page's pace: 30 times a second while the visitor is
	 * active, 20 when they are not, and every frame while the page scrolls.
	 */
	rate?: "frame" | "policy";
	run(frame: Frame): Result;
};

export type Task = {
	/** Put a sleeping task back in the loop (the frames start again if none was running). */
	wake(): void;
	/** A task that cannot be seen (its element is off screen) is not run, and keeps no frames going. */
	setVisible(visible: boolean): void;
	remove(): void;
};

/** The browser services the scheduler needs; tests pass their own. */
export type Env = {
	request(callback: (time: number) => void): number;
	cancel(id: number): void;
	/** The same clock as the frame timestamps, in milliseconds. */
	now(): number;
};

export type Options = {
	/** Updates per second of "policy" tasks while the visitor is active (default 30). */
	activeHz?: number;
	/** ... and when they are not (default 20). */
	idleHz?: number;
	/** How long after the last pointer or key event the visitor counts as active, in ms (default 2000). */
	activeHold?: number;
	/** How long after the last scroll event the page counts as scrolling, in ms (default 160). */
	scrollHold?: number;
};

export type Mode = "scroll" | "active" | "idle";

export type Scheduler = {
	add(options: TaskOptions): Task;
	/** The visitor did something (pointer, key): policy tasks run at the active rate for a while. */
	poke(): void;
	/** The page is scrolling: policy tasks run every frame for a moment. */
	scroll(): void;
	/** The tab is hidden: nothing runs and no frame is requested until it is shown again. */
	setHidden(hidden: boolean): void;
	readonly mode: Mode;
};

const MAX_DT = 0.05;

export function createScheduler(env: Env, options: Options = {}): Scheduler {
	const { activeHz = 30, idleHz = 20, activeHold = 2000, scrollHold = 160 } = options;
	type Entry = {
		phase: Phase;
		policy: boolean;
		run(frame: Frame): Result;
		awake: boolean;
		visible: boolean;
	};
	const tasks: Entry[] = [];
	let handle = 0;
	let last: number | null = null;
	let lastPolicy: number | null = null;
	let hidden = false;
	let activeUntil = -Infinity;
	let scrollUntil = -Infinity;

	function modeAt(time: number): Mode {
		if (time < scrollUntil) return "scroll";
		return time < activeUntil ? "active" : "idle";
	}

	function frame(time: number): void {
		handle = 0;
		const dt = last === null ? 0 : Math.min((time - last) / 1000, MAX_DT);
		last = time;
		const current = { time, dt };
		// "policy" tasks run when their turn comes at the current pace; they share one frame object
		const mode = modeAt(time);
		const hz = mode === "scroll" ? Number.POSITIVE_INFINITY : mode === "active" ? activeHz : idleHz;
		const due = lastPolicy === null || time - lastPolicy >= 1000 / hz - 2;
		const policy = {
			time,
			dt: lastPolicy === null ? 0 : Math.min((time - lastPolicy) / 1000, MAX_DT),
		};
		if (due) lastPolicy = time;
		for (const phase of PHASES) {
			for (const task of [...tasks]) {
				if (task.phase !== phase || !runnable(task) || !tasks.includes(task)) continue;
				if (task.policy && !due) continue;
				if (task.run(task.policy ? policy : current) === "sleep") task.awake = false;
			}
		}
		if (anyRunnable()) handle = env.request(frame);
		else reset(); // a long sleep is not a long frame
	}

	function runnable(task: Entry): boolean {
		return task.awake && task.visible;
	}

	function anyRunnable(): boolean {
		return !hidden && tasks.some(runnable);
	}

	function reset(): void {
		last = null;
		lastPolicy = null;
	}

	function ensure(): void {
		if (handle === 0 && anyRunnable()) handle = env.request(frame);
	}

	function settle(): void {
		if (handle !== 0 && !anyRunnable()) {
			env.cancel(handle);
			handle = 0;
			reset();
		}
	}

	return {
		poke() {
			activeUntil = env.now() + activeHold;
		},
		scroll() {
			scrollUntil = env.now() + scrollHold;
		},
		setHidden(value) {
			hidden = value;
			if (hidden) settle();
			else ensure();
		},
		get mode() {
			return modeAt(env.now());
		},
		add(spec) {
			const task: Entry = {
				phase: spec.phase,
				policy: spec.rate === "policy",
				run: spec.run,
				awake: true,
				visible: true,
			};
			tasks.push(task);
			ensure();
			return {
				wake() {
					if (!tasks.includes(task)) return;
					task.awake = true;
					ensure();
				},
				setVisible(visible) {
					task.visible = visible;
					if (visible) ensure();
					else settle();
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
