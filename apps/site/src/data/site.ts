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
	{ label: "Features", href: "/#agents" },
	{ label: "Plugins", href: "/#modular" },
	{ label: "Themes", href: "/#themes" },
	{ label: "Docs", href: site.docs },
	{ label: "Showcase", href: "/#showcase" },
] as const;

export const footer = [
	{
		title: "Product",
		links: [
			{ label: "Agents", href: "/#agents" },
			{ label: "Plugins", href: "/#modular" },
			{ label: "Customise", href: "/#panels" },
			{ label: "Technology", href: "/#kernel" },
		],
	},
	{
		title: "Learn & build",
		links: [
			{ label: "Documentation", href: site.docs },
			{ label: "Showcase", href: "/#showcase" },
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
