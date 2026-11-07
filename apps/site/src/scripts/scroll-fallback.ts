import { pageScheduler } from "@solidcraft/frame";
import { barSolid, datumShift } from "../lib/scroll";

// Where CSS cannot tie animations to the scroll position, the same two effects (the bar turning solid and the datum sheet drifting)
// are driven from the scheduler instead: it reads the scroll position, writes the two styles, and sleeps while the page is still.
const supported = CSS.supports("animation-timeline: scroll()");
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
const bar = document.querySelector<HTMLElement>(".bar");
const datum = document.querySelector<HTMLElement>(".datum");

if (!supported && bar && datum) {
	const scheduler = pageScheduler();
	document.documentElement.classList.add("scroll-js");
	let y = -1;
	let seen = -1;
	let viewport = innerHeight;
	let tile = 0;

	const measure = () => {
		viewport = innerHeight;
		tile = Number.parseFloat(getComputedStyle(datum).backgroundSize);
	};
	measure();

	const reader = scheduler.add({
		phase: "read",
		run() {
			const now = window.scrollY;
			if (now === y) return "sleep";
			y = now;
			return undefined;
		},
	});
	const writer = scheduler.add({
		phase: "write",
		run() {
			if (y === seen) return "sleep";
			seen = y;
			bar.style.setProperty("--bar-solid", String(barSolid(y, viewport)));
			if (!calm && tile > 0) datum.style.transform = `translate3d(0, ${datumShift(y, tile)}px, 0)`;
			return undefined;
		},
	});
	const wake = () => {
		reader.wake();
		writer.wake();
	};
	addEventListener("scroll", wake, { passive: true });
	addEventListener("resize", () => {
		measure();
		seen = -1;
		wake();
	});
}
