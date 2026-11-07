export const REPO = "tangency-labs/solidcraft";
export const PAGE = `https://github.com/${REPO}/releases`;

export type Platform = "windows" | "macos" | "linux" | "freebsd";
export type Channel = "stable" | "pre";

export type Release = {
	tag_name: string;
	html_url: string;
	prerelease: boolean;
	draft: boolean;
	assets: { name: string; browser_download_url: string }[];
};

// every release carries version-less copies of its installers, so a link needs only the release tag
const FILE: Record<Exclude<Platform, "freebsd">, string> = {
	windows: "solidcraft-windows-x64.msi",
	macos: "solidcraft-macos-universal.dmg",
	linux: "solidcraft-linux-x86_64.AppImage",
};

// FreeBSD has only a versioned file, found from the release's asset list
const BSD = /freebsd-x86_64\.tar\.gz$/;

export const platforms: { id: Platform; label: string }[] = [
	{ id: "windows", label: "Windows" },
	{ id: "macos", label: "macOS" },
	{ id: "linux", label: "Linux" },
	{ id: "freebsd", label: "FreeBSD" },
];

export type Known = { stable: Release | null; pre: Release | null };

/** A link for a platform. `null`: the release is not known yet (the latest stable); `false`: pre-release channel, none known. */
export function linkFor(release: Release | null | false, platform: Platform): string {
	if (release === null)
		return platform === "freebsd" ? `${PAGE}/latest` : `${PAGE}/latest/download/${FILE[platform]}`;
	if (release === false) return PAGE;
	if (platform === "freebsd") {
		const asset = release.assets.find((a) => BSD.test(a.name));
		return asset ? asset.browser_download_url : release.html_url;
	}
	return `https://github.com/${REPO}/releases/download/${encodeURIComponent(release.tag_name)}/${FILE[platform]}`;
}

export function pick(list: Release[]): Known {
	return {
		stable: list.find((r) => !r.prerelease && !r.draft) ?? null,
		pre: list.find((r) => r.prerelease && !r.draft) ?? null,
	};
}

/** The release a channel points at, in the form `linkFor` takes. */
export function current(channel: Channel, known: Known): Release | null | false {
	return channel === "pre" ? (known.pre ?? false) : known.stable;
}

export function versionLine(
	channel: Channel,
	release: Release | null | false,
): { text: string; href: string } {
	if (channel === "pre") {
		return release
			? { text: `${release.tag_name} pre-release`, href: release.html_url }
			: { text: "pre-releases on GitHub", href: PAGE };
	}
	return release
		? { text: `v${release.tag_name.replace(/^v/, "")} available`, href: release.html_url }
		: { text: "latest release", href: `${PAGE}/latest` };
}

/** Only what the page uses is kept, so the list is cheap to cache. */
export function slim(list: Release[]): Release[] {
	return list.map((r) => ({
		tag_name: r.tag_name,
		html_url: r.html_url,
		prerelease: r.prerelease,
		draft: r.draft,
		assets: (r.assets ?? [])
			.filter((a) => BSD.test(a.name))
			.map((a) => ({ name: a.name, browser_download_url: a.browser_download_url })),
	}));
}
