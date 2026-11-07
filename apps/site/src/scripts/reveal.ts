// Each block rises into place once as it enters the view; blocks of the same section follow one another by a short stagger.
const STEP = 80; // ms between neighbours
const MAX = 5; // neighbours that are staggered at most

const blocks = [...document.querySelectorAll<HTMLElement>(".rv")];

if ("IntersectionObserver" in window) {
	for (const section of document.querySelectorAll("section")) {
		const own = [...section.querySelectorAll<HTMLElement>(".rv")];
		own.forEach((el, i) => {
			el.style.setProperty("--d", `${Math.min(i, MAX) * STEP}ms`);
		});
	}
	const seen = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.classList.add("in");
				seen.unobserve(entry.target);
			}
		},
		{ threshold: 0.12 },
	);
	for (const el of blocks) seen.observe(el);
} else {
	for (const el of blocks) el.classList.add("in");
}
