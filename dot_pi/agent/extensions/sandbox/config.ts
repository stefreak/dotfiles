/**
 * Pure logic for the sandbox extension — no pi dependencies.
 * Platform-specific behavior is explicit (parameterized or via
 * runtimeConfigForPlatform) so it stays testable on any host.
 */

import * as path from "node:path";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import { minimatch } from "minimatch";

export type SandboxMode = "ask" | "sandboxed" | "yolo";

/** Network policy — identical on all platforms. */
const NETWORK_RULES: SandboxRuntimeConfig["network"] = {
	allowedDomains: [
		"raw.githubusercontent.com",
		"deepwiki.com",
		"docs.rs",
		"pkg.go.dev",
		"npmjs.org",
		"kagi.com",
		"*.kagi.com",
		"api.search.brave.com",
		"*.youtube.com",
	],
	deniedDomains: [],
};

/** Write-deny globs — identical on all platforms. */
const DENY_WRITE_PATTERNS: string[] = [
	".env",
	".env.*",
	"*.pem",
	"*.key",
	"**/node_modules/**",
	"**/vendor/**",
	"**/__pycache__/**",
	"**/.venv/**",
	"**/.git/**",
];

/**
 * Runtime config per platform.
 *
 * Windows (alpha, enforced via NTFS ACLs + WFP egress fence under a
 * dedicated sandbox user) targets the credential locations Windows tooling
 * uses, and allows writing to the per-user temp dir. `~` is expanded by the
 * library at initialize() time on every platform.
 */
export function runtimeConfigForPlatform(
	platform: NodeJS.Platform,
): SandboxRuntimeConfig {
	if (platform === "win32") {
		return {
			network: { ...NETWORK_RULES },
			filesystem: {
				denyRead: [
					"~/.ssh",
					"~/.aws",
					"~/.gnupg",
					"~/.config/gh",
					"~/AppData/Roaming/gh",
				],
				allowWrite: [".", "~/AppData/Local/Temp"],
				denyWrite: [...DENY_WRITE_PATTERNS],
			},
		};
	}
	return {
		network: { ...NETWORK_RULES },
		filesystem: {
			denyRead: [
				"~/.ssh",
				"~/.aws",
				"~/.gnupg",
				"~/Library/Application Support",
				"~/Library/Keychains",
				"~/.local/share/keyrings",
				"~/.pki",
			],
			allowWrite: [".", "/tmp"],
			denyWrite: [...DENY_WRITE_PATTERNS],
		},
	};
}

export const DEFAULT_RUNTIME_CONFIG: SandboxRuntimeConfig =
	runtimeConfigForPlatform(process.platform);

export const ALL_TOOLS = new Set(["bash", "write", "edit", "read"]);
export const WRITE_TOOLS = new Set(["write", "edit"]);

/**
 * Supported platforms for OS-level sandboxing.
 * Windows is alpha — see the library README (dedicated sandbox user,
 * ACL + WFP enforcement; one-time `windows-install` setup required).
 */
export const SUPPORTED_PLATFORMS = new Set(["darwin", "linux", "win32"]);

/**
 * Select dialog options for sandbox bypass approval.
 */
export const BYPASS_OPTIONS = [
	"✅ Allow — run outside sandbox",
	"❌ Deny",
] as const;

export const BYPASS_ALLOW = BYPASS_OPTIONS[0];
export const BYPASS_DENY = BYPASS_OPTIONS[1];

/**
 * Select dialog options for ask-mode tool confirmation.
 */
export const CONFIRM_OPTIONS = ["✅ Allow", "❌ Deny"] as const;

export const CONFIRM_ALLOW = CONFIRM_OPTIONS[0];
export const CONFIRM_DENY = CONFIRM_OPTIONS[1];

/**
 * Check whether a tool requires user confirmation in the given mode.
 * Ask mode: confirm all tools. Other modes: no confirmation.
 */
export function shouldConfirmTool(
	mode: SandboxMode,
	toolName: string,
): boolean {
	if (mode !== "ask") return false;
	return ALL_TOOLS.has(toolName);
}

/** How often to repeat the full sandbox context. */
export const SANDBOX_CONTEXT_INTERVAL = 50;

/**
 * Decide whether to show the full or brief footer based on call count.
 * Returns true on the first call after a reset and every N calls.
 */
export function shouldShowFullFooter(callCount: number): boolean {
	return callCount === 1 || callCount % SANDBOX_CONTEXT_INTERVAL === 0;
}

/**
 * Brief footer appended to every sandboxed bash result.
 */
export function sandboxFooterBrief(): string {
	return "-- SANDBOX: ENABLED --";
}

/**
 * Full sandbox context appended every SANDBOX_CONTEXT_INTERVAL tool calls.
 */
export function sandboxFooterFull(): string {
	const cfg = DEFAULT_RUNTIME_CONFIG;
	return [
		"--- SANDBOX ---",
		`Network allowed: ${cfg.network.allowedDomains.join(", ")}`,
		`Network denied: ${cfg.network.deniedDomains.join(", ") || "(none)"}`,
		`Filesystem deny read: ${cfg.filesystem.denyRead.join(", ")}`,
		`Filesystem allow write: ${cfg.filesystem.allowWrite.join(", ")}`,
		`Filesystem deny write: ${cfg.filesystem.denyWrite.join(", ")}`,
		"",
		"If a command fails due to sandbox restrictions, re-run with askOutsideSandbox: true.",
		"Do not ask the user first — just set the flag and re-run.",
		"--- END SANDBOX ---",
	].join("\n");
}

/**
 * Human-readable status text for a mode.
 */
export function modeStatusText(mode: SandboxMode): string {
	switch (mode) {
		case "ask":
			return "🔐 Ask mode: confirm every tool call, no sandbox (/sandbox)";
		case "sandboxed":
			return (
				"🎪 Sandboxed mode: write to " +
				`${DEFAULT_RUNTIME_CONFIG.filesystem.allowWrite.join(", ")} (/sandbox)`
			);
		case "yolo":
			return "🚀 YOLO mode: no restrictions, no questions";
	}
}

/**
 * Check if a read to the given path would violate sandbox restrictions.
 * Returns true if the read needs a bypass dialog.
 */
export function isReadRestricted(
	absolutePath: string,
	homeDir: string,
	cfg: SandboxRuntimeConfig = DEFAULT_RUNTIME_CONFIG,
): boolean {
	const normalizedPath = path.resolve(absolutePath);

	// Resolve denyRead paths (handle ~)
	const resolvedDenyRead = cfg.filesystem.denyRead.map((p) =>
		path.resolve(p.startsWith("~") ? p.replace("~", homeDir) : p),
	);

	return resolvedDenyRead.some(
		(denied) =>
			normalizedPath === denied || normalizedPath.startsWith(denied + path.sep),
	);
}

/**
 * Check if a write to the given path would violate sandbox restrictions.
 * Returns true if the write needs a bypass dialog.
 *
 * A write needs bypass if:
 * - The path is in a restricted read area, OR
 * - The path is outside all allowed write directories, OR
 * - The path matches a denied write pattern
 */
export function isWriteRestricted(
	absolutePath: string,
	cwd: string,
	homeDir: string,
	cfg: SandboxRuntimeConfig = DEFAULT_RUNTIME_CONFIG,
): boolean {
	const normalizedPath = path.resolve(absolutePath);

	// If you can't read it, you definitely can't write it
	if (isReadRestricted(normalizedPath, homeDir, cfg)) return true;

	// Resolve allowed write dirs to absolute paths
	const allowedAbs = cfg.filesystem.allowWrite.map((p) => {
		if (p === ".") return path.resolve(cwd);
		// `~` anchors at the home dir, not the cwd (Windows temp dir)
		if (p.startsWith("~")) return path.resolve(p.replace("~", homeDir));
		return path.resolve(cwd, p);
	});

	// Check if path is under any allowed dir
	const matchedAllowed = allowedAbs.find(
		(allowed) =>
			normalizedPath === allowed ||
			normalizedPath.startsWith(allowed + path.sep),
	);

	if (!matchedAllowed) return true;

	// Even if under allowed dir, check deny patterns against the basename
	// and relative path (relative to the matched allowed directory)
	const basename = path.basename(normalizedPath);
	const relative = path.relative(matchedAllowed, normalizedPath);

	const matchesDeny = cfg.filesystem.denyWrite.some((pattern) => {
		// Use dot: true to ensure hidden files like .env are matched correctly
		const options = { dot: true };
		if (minimatch(basename, pattern, options)) return true;
		if (relative && minimatch(relative, pattern, options)) return true;

		return false;
	});

	return matchesDeny;
}
