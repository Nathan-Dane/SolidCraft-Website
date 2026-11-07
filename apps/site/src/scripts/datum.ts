const SHARE = 0.12; // the datum sheet moves at this fraction of the page's speed

const backdrop = document.querySelector<HTMLElement>(".backdrop");
const datum = document.querySelector<HTMLElement>(".datum");

// The sheet moves one tile per turn of its scroll-driven animation, so the number of turns for the whole page is the distance it
// should travel (a share of the scroll range) divided by the tile. This is measured when the layout changes, never while scrolling.
function update(): void {
	if (!backdrop || !datum) return;
	const tile = Number.parseFloat(getComputedStyle(datum).backgroundSize);
	const range = document.documentElement.scrollHeight - window.innerHeight;
	if (!(tile > 0)) return;
	backdrop.style.setProperty("--datum-turns", String(Math.max((SHARE * range) / tile, 0.0001)));
}

update();
new ResizeObserver(update).observe(document.documentElement);
