/**
 * Pure logic for the sandbox extension — no pi or OS dependencies.
 * Extracted for testability.
 */

import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

export type SandboxMode = "ask" | "sandboxed" | "yolo";

export const DEFAULT_RUNTIME_CONFIG: SandboxRuntimeConfig = {
	network: {
		allowedDomains: [
			"raw.githubusercontent.com",
			"deepwiki.com",
			"docs.rs",
			"pkg.go.dev",
			"npmjs.org",
			"kagi.com",
			"*.kagi.com",
			"api.search.brave.com",
		],
		deniedDomains: [],
	},
	filesystem: {
		denyRead: ["~/.ssh", "~/.aws", "~/.gnupg"],
		allowWrite: [".", "/tmp"],
		denyWrite: [
			".env",
			".env.*",
			"*.pem",
			"*.key",
			"**/node_modules/**",
			"**/vendor/**",
			"**/__pycache__/**",
			"**/.venv/**",
			"**/.git/**",
		],
	},
};

export const ALL_TOOLS = new Set(["bash", "write", "edit", "read"]);
export const WRITE_TOOLS = new Set(["write", "edit"]);

/**
 * Supported platforms for OS-level sandboxing.
 */
export const SUPPORTED_PLATFORMS = new Set(["darwin", "linux"]);

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
			return "🎪 Sandboxed mode: write to ., /tmp (/sandbox)";
		case "yolo":
			return "🚀 YOLO mode: no restrictions, no questions";
	}
}
