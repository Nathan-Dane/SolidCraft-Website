import type { IntroEffects, Stage } from "@solidcraft/field";

const STAGES: Stage[] = ["datum", "logo", "pills", "title", "bar", "tag", "meta", "cue"];
const root = document.documentElement;

/** How long a skipped entrance's parts take to fade in before the page lets go of its hidden states. */
const SKIP_FADE = 800;

/** Puts the page back as it is without an entrance: nothing hidden, nothing waiting. */
export function clearIntro(): void {
	for (const s of STAGES) root.classList.remove(`i-${s}`);
	root.classList.remove("intro");
	delete root.dataset.intro;
	for (const e of document.querySelectorAll(".sat.shown")) e.classList.remove("shown");
}

/** What the entrance does to the page's parts, or null when the page is not showing one (html.intro is set by the head gate). */
export function introEffects(): IntroEffects | null {
	if (!root.classList.contains("intro")) return null;
	return {
		stage(stage) {
			root.classList.add(`i-${stage}`);
			if (stage === "datum") root.dataset.intro = "playing"; // the head's safety limit no longer applies
		},
		satellite(key) {
			document.querySelector(`[data-satellite="${key}"]`)?.classList.add("shown");
		},
		ended(skipped) {
			if (skipped) setTimeout(clearIntro, SKIP_FADE);
			else clearIntro();
		},
	};
}
