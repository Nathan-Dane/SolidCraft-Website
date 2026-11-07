/*
 * The scene the simulation draws into: a small retained tree of virtual elements (g / path / circle / use) that carry the same
 * attributes SVG would (d, transform, stroke, opacity, ...). The renderer reads this tree. `scene.dirty` is set whenever anything
 * in it changes, so unchanged frames are not redrawn.
 */

export const scene = { dirty: true };

export type Attrs = Record<string, string | number>;

export type ElementName = "g" | "path" | "circle" | "use";

/** `style.display = "none"` hides an element, as in the DOM. */
class Style {
	private owner: VEl;
	private value = "";

	constructor(owner: VEl) {
		this.owner = owner;
	}

	get display(): string {
		return this.value;
	}

	set display(v: string) {
		if (this.value === v) return;
		this.value = v;
		this.owner.hide = v === "none";
		scene.dirty = true;
	}
}

export class VEl {
	readonly name: ElementName;
	a: Attrs = {};
	kids: VEl[] = [];
	parent: VEl | null = null;
	hide = false;
	readonly style: Style;
	/** Cached work of the renderer for this element (parsed path, circle as path). */
	cache: Record<string, unknown> = {};

	constructor(name: ElementName, attrs?: Attrs | null) {
		this.name = name;
		this.style = new Style(this);
		if (attrs) Object.assign(this.a, attrs);
	}

	setAttribute(k: string, v: string | number): void {
		if (this.a[k] !== v) {
			this.a[k] = v;
			scene.dirty = true;
		}
	}

	removeAttribute(k: string): void {
		delete this.a[k];
		scene.dirty = true;
	}

	appendChild(child: VEl): VEl {
		child.parent = this;
		this.kids.push(child);
		scene.dirty = true;
		return child;
	}

	remove(): void {
		if (!this.parent) return;
		const i = this.parent.kids.indexOf(this);
		if (i >= 0) this.parent.kids.splice(i, 1);
		this.parent = null;
		scene.dirty = true;
	}

	/** Remove all children. */
	clear(): void {
		this.kids.length = 0;
		scene.dirty = true;
	}
}

// glyph ids used for label text (one per character of the Plex Mono outline set)
const SPECIAL: Readonly<Record<string, string>> = {
	".": "gdot",
	"°": "gdeg",
	R: "gR",
	Ø: "gO",
	L: "gL",
	"-": "gm",
};

export function glyphId(ch: string): string {
	return SPECIAL[ch] ?? `g${ch}`;
}
