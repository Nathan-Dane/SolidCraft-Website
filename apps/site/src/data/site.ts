import { url } from "../lib/url";

export const site = {
	name: "SolidCraft",
	url: "https://solidcraft.io",
	description:
		"SolidCraft by Tangency Labs: open-source parametric CAD built in Rust. Sketch, set dimensions and build 3D parts with an editable feature history.",
	github: "https://github.com/tangency-labs/solidcraft",
	discord: "https://discord.gg/FtU4NQNVDH",
	docs: "https://docs.solidcraft.io/",
	app: "https://app.solidcraft.io/",
	releases: "https://github.com/tangency-labs/solidcraft/releases",
} as const;

export const nav = [
	{ label: "Features", href: url("/features/") },
	{ label: "Plugins", href: url("/plugins/") },
	{ label: "Themes", href: url("/themes/") },
	{ label: "Docs", href: site.docs },
	{ label: "Showcase", href: url("/showcase/") },
] as const;

export const footer = [
	{
		title: "Product",
		links: [
			{ label: "Features", href: url("/features/") },
			{ label: "Plugins", href: url("/plugins/") },
			{ label: "Themes", href: url("/themes/") },
			{ label: "Showcase", href: url("/showcase/") },
		],
	},
	{
		title: "Learn & build",
		links: [
			{ label: "Documentation", href: site.docs },
			{ label: "Contribute", href: `${site.github}/blob/main/CONTRIBUTING.md` },
		],
	},
	{
		title: "Project",
		links: [
			{ label: "GitHub", href: site.github },
			{ label: "Discord", href: site.discord },
			{ label: "Issues", href: `${site.github}/issues` },
		],
	},
] as const;

/** The four satellites of the hero: each is a node of the field with an icon and a label, and a page of its own. */
export const satellites = [
	{ key: "plugins", label: "Plugins", sub: "add-ons", href: url("/plugins/"), left: 17, top: 36 },
	{ key: "themes", label: "Themes", sub: "studio", href: url("/themes/"), left: 83, top: 36 },
	{
		key: "solidcore",
		label: "SolidCore",
		sub: "kernel",
		href: url("/features/#solidcore"),
		left: 24,
		top: 78,
	},
	{ key: "agents", label: "Agents", sub: "MCP", href: url("/features/#agents"), left: 76, top: 78 },
] as const;
