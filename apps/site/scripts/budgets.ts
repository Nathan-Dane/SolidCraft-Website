import { gzipSync } from "node:zlib";

/** A limit on built files whose name matches, and (when given) whose text contains `has`. The first matching budget applies. */
export type Budget = { pattern: RegExp; has?: RegExp; label: string; maxGzipBytes: number };

export const budgets: Budget[] = [
	{ pattern: /\.html$/, label: "HTML", maxGzipBytes: 12 * 1024 },
	{ pattern: /\.css$/, label: "CSS", maxGzipBytes: 12 * 1024 },
	{
		pattern: /\.js$/,
		has: /getContext\(["'`]webgl/,
		label: "field engine",
		maxGzipBytes: 35 * 1024,
	},
	{ pattern: /\.js$/, has: /cur-ring/, label: "cursor", maxGzipBytes: 6 * 1024 },
	{ pattern: /\.js$/, label: "JavaScript", maxGzipBytes: 12 * 1024 },
];

export type Finding = { file: string; label: string; bytes: number; max: number };

export function overBudget(files: { file: string; data: Uint8Array }[], list = budgets): Finding[] {
	const findings: Finding[] = [];
	for (const { file, data } of files) {
		const budget = list.find(
			(b) => b.pattern.test(file) && (!b.has || b.has.test(Buffer.from(data).toString("utf8"))),
		);
		if (!budget) continue;
		const bytes = gzipSync(data).length;
		if (bytes > budget.maxGzipBytes) {
			findings.push({ file, label: budget.label, bytes, max: budget.maxGzipBytes });
		}
	}
	return findings;
}
