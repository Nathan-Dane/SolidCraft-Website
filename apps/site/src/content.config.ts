import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const link = z.object({ label: z.string(), href: z.string() });

const home = defineCollection({
	loader: glob({ pattern: "*.md", base: "./src/content/home" }),
	schema: z.object({
		order: z.number().int(),
		anchor: z.string().regex(/^[a-z]+$/),
		eyebrow: z.string().optional(),
		title: z.string(),
		layout: z.enum(["split", "split-reverse", "stacked", "band", "get"]),
		stage: z
			.object({
				kind: z.string(),
				label: z.string(),
				text: z.string(),
				wide: z.boolean().default(false),
			})
			.optional(),
		link: link.optional(),
		facts: z.array(z.string()).optional(),
		chips: z.array(z.string()).optional(),
		cards: z
			.array(z.object({ title: z.string(), text: z.string(), href: z.string().optional() }))
			.optional(),
		actions: z.array(link.extend({ primary: z.boolean().default(false) })).optional(),
	}),
});

export const collections = { home };
