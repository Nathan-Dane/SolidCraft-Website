import { gzipSync } from "node:zlib";

export type Budget = { pattern: RegExp; label: string; maxGzipBytes: number };

export const budgets: Budget[] = [
	{ pattern: /\.html$/, label: "HTML", maxGzipBytes: 30 * 1024 },
	{ pattern: /\.css$/, label: "CSS", maxGzipBytes: 30 * 1024 },
	{ pattern: /\.js$/, label: "JavaScript", maxGzipBytes: 60 * 1024 },
];

export type Finding = { file: string; label: string; bytes: number; max: number };

export function overBudget(files: { file: string; data: Uint8Array }[], list = budgets): Finding[] {
	const findings: Finding[] = [];
	for (const { file, data } of files) {
		const budget = list.find((b) => b.pattern.test(file));
		if (!budget) continue;
		const bytes = gzipSync(data).length;
		if (bytes > budget.maxGzipBytes) {
			findings.push({ file, label: budget.label, bytes, max: budget.maxGzipBytes });
		}
	}
	return findings;
}
