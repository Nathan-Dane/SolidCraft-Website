import { useEffect, useRef, useState } from "preact/hooks";
import {
	type Channel,
	current,
	type Known,
	linkFor,
	pick,
	platforms,
	REPO,
	type Release,
	slim,
	versionLine,
} from "../lib/releases";

const CHANNEL_KEY = "sc-channel";
const CACHE_KEY = "sc-releases";

function read<T>(storage: Storage, key: string): T | null {
	try {
		return JSON.parse(storage.getItem(key) ?? "null") as T | null;
	} catch {
		return null;
	}
}

export default function ReleaseLine() {
	const [channel, setChannel] = useState<Channel>("stable");
	const [known, setKnown] = useState<Known>({ stable: null, pre: null });
	const [open, setOpen] = useState(false);
	const menu = useRef<HTMLDivElement>(null);

	useEffect(() => {
		try {
			if (localStorage.getItem(CHANNEL_KEY) === "pre") setChannel("pre");
		} catch {
			// storage unavailable: the stable channel stays
		}
		// cached for the session, so a reload does not spend the API's anonymous rate limit
		const cached = read<Release[]>(sessionStorage, CACHE_KEY);
		if (cached) {
			setKnown(pick(cached));
			return;
		}
		fetch(`https://api.github.com/repos/${REPO}/releases?per_page=20`, {
			headers: { Accept: "application/vnd.github+json" },
		})
			.then((res) =>
				res.ok ? (res.json() as Promise<Release[]>) : Promise.reject(new Error(String(res.status))),
			)
			.then((list) => {
				const kept = slim(list);
				try {
					sessionStorage.setItem(CACHE_KEY, JSON.stringify(kept));
				} catch {
					// not cached
				}
				setKnown(pick(kept));
			})
			.catch(() => {
				// the static links to the latest release keep working
			});
	}, []);

	const release = current(channel, known);
	const line = versionLine(channel, release);

	useEffect(() => {
		const download = document.getElementById("dl") as HTMLAnchorElement | null;
		if (download) download.href = linkFor(release, "macos");
	}, [release]);

	useEffect(() => {
		if (!open) return;
		const close = (e: MouseEvent) => {
			if (!menu.current?.contains(e.target as Node)) setOpen(false);
		};
		const key = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setOpen(false);
				document.getElementById("more")?.focus();
			}
		};
		document.addEventListener("click", close);
		document.addEventListener("keydown", key);
		return () => {
			document.removeEventListener("click", close);
			document.removeEventListener("keydown", key);
		};
	}, [open]);

	function toggleChannel() {
		const next: Channel = channel === "pre" ? "stable" : "pre";
		setChannel(next);
		try {
			localStorage.setItem(CHANNEL_KEY, next);
		} catch {
			// not remembered
		}
	}

	return (
		<div class="statusblock" data-quiet>
			<div class="meta status" data-ch={channel}>
				<a class="ver" id="ver" href={line.href} data-focus>
					<i class="dot" />
					<span>{line.text}</span>
				</a>
				<button
					class="switch"
					data-focus
					type="button"
					role="switch"
					aria-checked={channel === "pre"}
					onClick={toggleChannel}
				>
					<span class="track">
						<i />
					</span>
					<span class="lab">Pre-release</span>
				</button>
				<button
					class="more"
					data-focus
					type="button"
					id="more"
					aria-expanded={open}
					aria-controls="more-menu"
					onClick={() => setOpen(!open)}
				>
					More downloads
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M7 10l5 5 5-5" />
					</svg>
				</button>
			</div>
			<div class="more-menu" id="more-menu" ref={menu} hidden={!open}>
				<div class="mm-label">Latest build for</div>
				<nav class="plats" aria-label="Latest build for">
					{platforms.map((p) => (
						<a key={p.id} href={linkFor(release, p.id)} data-plat={p.id} data-focus>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M12 5v10M8 11.5l4 4 4-4M6 19.5h12" />
							</svg>
							{p.label}
						</a>
					))}
				</nav>
			</div>
		</div>
	);
}
