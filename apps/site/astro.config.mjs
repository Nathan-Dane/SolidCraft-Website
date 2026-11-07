import preact from "@astrojs/preact";
import { defineConfig } from "astro/config";

export default defineConfig({
	site: "https://solidcraft.io",
	output: "static",
	trailingSlash: "always",
	integrations: [preact()],
});
