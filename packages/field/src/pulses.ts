/** Pulses: a click on a node sends light along its webs, node by node. */
import type { Sim } from "./sim.ts";
import type { FieldEdge, FieldNode } from "./types.ts";

export function pulseFrom({ S }: Sim, id: number): void {
	const ns = S.nodes;
	const hops = new Map<number, number>([[id, 0]]);
	const queue = [id];
	const links: { e: FieldEdge; from: number; hop: number }[] = [];
	while (queue.length) {
		const cur = queue.shift() as number;
		for (const e of S.edges) {
			if (e.u < 0.6) continue;
			const other = e.i === cur ? e.j : e.j === cur ? e.i : -1;
			if (other < 0) continue;
			if (!hops.has(other)) {
				const hop = hops.get(cur) as number;
				hops.set(other, hop + 1);
				queue.push(other);
				links.push({ e, from: cur, hop });
			}
		}
	}
	const step = 0.24;
	const start = ns[id] as FieldNode;
	start.pulse = 1;
	start.tgt += start.step;
	for (const l of links) {
		S.fires.push({ at: S.t + l.hop * step, kind: "edge", e: l.e, dir: l.e.i === l.from ? 1 : -1 });
		S.fires.push({
			at: S.t + (l.hop + 1) * step * 0.95 + 0.1,
			kind: "node",
			dir: l.hop % 2 === 0 ? -1 : 1,
			id: l.from === l.e.i ? l.e.j : l.e.i,
		});
	}
}

/** Run what is due. */
export function runFires({ S }: Sim): void {
	for (let k = S.fires.length - 1; k >= 0; k--) {
		const f = S.fires[k];
		if (!f || S.t < f.at) continue;
		S.fires.splice(k, 1);
		if (f.kind === "edge") {
			f.e.pulseP = 0;
			f.e.pulseDir = f.dir;
		} else {
			const n = S.nodes[f.id] as FieldNode;
			n.pulse = Math.max(n.pulse, f.soft ? 0.5 : 0.9);
			n.tgt += n.step * (f.dir || 1);
			n.next = Math.max(n.next, S.t + 6);
		}
	}
}
