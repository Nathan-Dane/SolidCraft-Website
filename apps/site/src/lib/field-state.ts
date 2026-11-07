import type { Host } from "@solidcraft/field";

// The field's host is created by one script and wanted by another (the cursor docks on its nodes): this is where they meet.
let current: Host | null = null;
const listeners = new Set<(host: Host) => void>();

export function publishField(host: Host): void {
	current = host;
	for (const fn of listeners) fn(host);
}

/** Calls `fn` with the field's host: now if it exists, otherwise when it does. */
export function whenField(fn: (host: Host) => void): void {
	if (current) fn(current);
	else listeners.add(fn);
}
