/** How the nodes move: drifting around their homes, leaning toward the cursor, keeping apart and out of the text. */
import { clamp, easeInOut } from "./math.ts";
import type { Sim } from "./sim.ts";
import type { FieldNode } from "./types.ts";

function nodeTarget({ S }: Sim, n: FieldNode, t: number): { x: number; y: number } {
	const k = S.amp;
	return {
		x:
			n.hx + k * (n.ax * (0.64 * Math.sin(n.wx1 * t + n.px1) + 0.36 * Math.sin(n.wx2 * t + n.px2))),
		y:
			n.hy + k * (n.ay * (0.64 * Math.sin(n.wy1 * t + n.py1) + 0.36 * Math.sin(n.wy2 * t + n.py2))),
	};
}

/** Keep the drifting field clear of the page's text: push a node out of every text rectangle. */
function pushOutOfRects({ S }: Sim, n: FieldNode, margin: number): void {
	for (const r of S.rects) {
		const m = n.R + margin;
		const qx = clamp(n.x, r[0], r[2]);
		const qy = clamp(n.y, r[1], r[3]);
		const dx = n.x - qx;
		const dy = n.y - qy;
		const d = Math.hypot(dx, dy);
		if (d >= m) continue;
		if (d > 0.001) {
			n.x = qx + (dx / d) * m;
			n.y = qy + (dy / d) * m;
			continue;
		}
		const edges = [n.x - r[0], r[2] - n.x, n.y - r[1], r[3] - n.y]; // centre inside the rectangle: leave by the nearest side
		const k = edges.indexOf(Math.min(...edges));
		if (k === 0) n.x = r[0] - m;
		else if (k === 1) n.x = r[2] + m;
		else if (k === 2) n.y = r[1] - m;
		else n.y = r[3] + m;
	}
}

export function stepNodes(sim: Sim, dt: number): void {
	const { S, rand } = sim;
	const t = S.t;
	const ns = S.nodes;
	const halo = new Map<number, number>();
	const fid = S.hover;
	if (fid >= 0) {
		for (const e of S.edges) {
			if (e.u > 0.6) {
				if (e.i === fid) halo.set(e.j, 1);
				else if (e.j === fid) halo.set(e.i, 1);
			}
		}
	}
	for (const n of ns) {
		// the cursor's pull (also on the anchored hero nodes, which otherwise never move)
		n.qvx += (140 * (n.ptx - n.qx) - 14 * n.qvx) * dt;
		n.qvy += (140 * (n.pty - n.qy) - 14 * n.qvy) * dt;
		n.qx += n.qvx * dt;
		n.qy += n.qvy * dt;
		if (n.fixed) {
			n.x = n.hx + n.qx;
			n.y = n.hy + n.qy;
			continue;
		}
		const tg = nodeTarget(sim, n, t);
		const dec = Math.exp(-dt * 0.55);
		n.ox *= dec;
		n.oy *= dec;
		n.kvx += (-60 * n.kx - 7 * n.kvx) * dt;
		n.kvy += (-60 * n.ky - 7 * n.kvy) * dt;
		n.kx += n.kvx * dt;
		n.ky += n.kvy * dt;
		n.x = tg.x + n.ox + n.kx + n.qx;
		n.y = tg.y + n.oy + n.ky + n.qy;
	}
	// soft separation
	for (let it = 0; it < 3; it++) {
		for (let i = 0; i < ns.length; i++) {
			for (let j = i + 1; j < ns.length; j++) {
				const a = ns[i] as FieldNode;
				const b = ns[j] as FieldNode;
				const ddx = b.x - a.x;
				const ddy = b.y - a.y;
				const d = Math.hypot(ddx, ddy) || 0.001;
				const minGap = 30 + 0.05 * (a.R + b.R);
				const need = a.R + b.R + minGap - d;
				if (need > 0) {
					const wa = a.fixed ? 0 : 1;
					const wb = b.fixed ? 0 : 1;
					const ws = wa + wb || 1;
					const ux = ddx / d;
					const uy = ddy / d;
					a.x -= (ux * need * wa) / ws;
					a.y -= (uy * need * wa) / ws;
					b.x += (ux * need * wb) / ws;
					b.y += (uy * need * wb) / ws;
				}
			}
		}
	}
	for (const n of ns) if (!n.fixed) pushOutOfRects(sim, n, 20);
	// scroll parallax, applied last so the layout rules above still work in the page's own (unscrolled) coordinates
	for (const n of ns) n.y -= S.scroll * (n.fixed ? 1 : S.parK);
	// sprockets: nodes inside a chain loop turn with it; otherwise they ease back to a detent
	const spin = new Map<number, number>();
	for (const c of S.chains) {
		for (const id of c.ids) spin.set(id, (24 / ((ns[id] as FieldNode).R + 14)) * easeInOut(c.u));
	}
	for (let i = 0; i < ns.length; i++) {
		const w = ns[i] as FieldNode;
		const s = spin.get(i);
		w.inChain = s !== undefined;
		if (s !== undefined) w.chainSpin += s * dt;
		else if (w.chainSpin !== 0) {
			const sa2 = w.style === "plain" ? Math.PI / 2 : w.step;
			const tq = Math.round(w.chainSpin / sa2) * sa2;
			w.chainSpin += (tq - w.chainSpin) * (1 - Math.exp(-dt * 2));
			if (Math.abs(tq - w.chainSpin) < 1e-4) w.chainSpin = tq;
		}
	}
	// mechanical details (index detents with a little overshoot)
	for (const q of ns) {
		if (t > q.next) {
			q.tgt += q.step * (rand() < 0.22 ? -1 : 1);
			q.next = t + 6 + rand() * 11;
		}
		const acc = 78 * (q.tgt - q.ang) - 11 * q.vel;
		q.vel += acc * dt;
		q.ang += q.vel * dt;
		if (Math.abs(q.tgt - q.ang) < 1e-4 && Math.abs(q.vel) < 1e-3) {
			q.ang = q.tgt;
			q.vel = 0;
		}
		q.pulse = q.pulse > 0.002 ? q.pulse * Math.exp(-dt * 2.4) : 0;
		const hotT = q.extraHot || S.hover === q.id ? 1 : halo.get(q.id) ? 0.3 : 0;
		q.hot += (hotT - q.hot) * (1 - Math.exp(-dt * 10));
		if (q.hot < 0.002 && !hotT) q.hot = 0;
	}
}
