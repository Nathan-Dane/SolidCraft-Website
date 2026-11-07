import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { overBudget } from "./budgets.ts";

const dist = new URL("../dist", import.meta.url).pathname;

function walk(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
	);
}

const files = walk(dist).map((path) => ({
	file: relative(dist, path),
	data: readFileSync(path),
}));

const problems: string[] = [];

for (const { file, data } of files) {
	if (!file.endsWith(".html")) continue;
	const html = data.toString("utf8");
	if (!/<html[^>]*\slang="[a-z-]+"/i.test(html)) problems.push(`${file}: missing html lang`);
	if (!/<title>[^<]+<\/title>/i.test(html)) problems.push(`${file}: missing title`);
	if (/<script[^>]+src="https?:\/\//i.test(html)) problems.push(`${file}: external script`);
}

for (const f of overBudget(files)) {
	problems.push(`${f.file}: ${f.label} is ${f.bytes} B gzipped, over ${f.max} B`);
}

if (problems.length > 0) {
	console.error(problems.join("\n"));
	process.exit(1);
}
console.log(`Checked ${files.length} built files.`);
