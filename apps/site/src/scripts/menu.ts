// The bar's menu for narrow windows: a button that opens the list of pages below the bar.
const button = document.querySelector<HTMLButtonElement>(".menu-btn");
const drawer = document.getElementById("menu");

if (button && drawer) {
	const set = (open: boolean): void => {
		button.setAttribute("aria-expanded", String(open));
		drawer.hidden = !open;
	};
	const isOpen = (): boolean => !drawer.hidden;

	button.addEventListener("click", () => set(!isOpen()));
	// a link, a click elsewhere or Escape closes it (Escape returns focus to the button)
	drawer.addEventListener("click", (e) => {
		if ((e.target as Element).closest("a")) set(false);
	});
	addEventListener("click", (e) => {
		if (isOpen() && !(e.target as Element).closest(".bar")) set(false);
	});
	addEventListener("keydown", (e) => {
		if (e.key === "Escape" && isOpen()) {
			set(false);
			button.focus();
		}
	});
	// the menu has no place once the links are in the bar
	matchMedia("(min-width: 1001px)").addEventListener("change", (e) => {
		if (e.matches) set(false);
	});
}
