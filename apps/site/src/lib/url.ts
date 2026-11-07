/** An address inside the site, whatever the site is served under (the base is empty at a domain's root). */
export function url(path: string): string {
	return import.meta.env.BASE_URL.replace(/\/$/, "") + path;
}
