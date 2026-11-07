import preact from "@astrojs/preact";
import { defineConfig } from "astro/config";

export default defineConfig({
	// the address and base can be set for a build that is served somewhere else (the Pages deploy)
	site: process.env.SITE_URL ?? "https://solidcraft.io",
	base: process.env.SITE_BASE ?? "/",
	output: "static",
	trailingSlash: "always",
	integrations: [preact()],
});
