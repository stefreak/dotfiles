/**
 * Pure logic for the sandbox extension — no pi or OS dependencies.
 * Extracted for testability.
 */

import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

export type SandboxMode = "ask" | "sandboxed" | "yolo";

export const DEFAULT_RUNTIME_CONFIG: SandboxRuntimeConfig = {
	network: {
		allowedDomains: [
			"npmjs.org",
			"*.npmjs.org",
			"registry.npmjs.org",
			"registry.yarnpkg.com",
			"pypi.org",
			"*.pypi.org",
			"github.com",
			"*.github.com",
			"api.github.com",
			"raw.githubusercontent.com",
			"kagi.com",
			"*.kagi.com",
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

/**
 * Only sandboxed mode uses the OS sandbox.
 * Ask and yolo run without OS-level restrictions.
 */
export function getRuntimeConfigForMode(
	mode: SandboxMode,
): SandboxRuntimeConfig | null {
	if (mode === "sandboxed") return DEFAULT_RUNTIME_CONFIG;
	return null;
}

export const ALL_TOOLS = new Set(["bash", "write", "edit", "read"]);
export const WRITE_TOOLS = new Set(["write", "edit"]);

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
 * Format an edit tool's input as a diff-style summary.
 */
export function formatEditDiff(input: {
	edits?: Array<{ oldText?: string; newText?: string }>;
}): string {
	const edits = input.edits ?? [];
	const lines: string[] = [];
	for (const edit of edits) {
		const oldText = edit.oldText ?? "";
		const newText = edit.newText ?? "";
		const oldLines = oldText === "" ? [] : oldText.split("\n");
		const newLines = newText === "" ? [] : newText.split("\n");

		const maxLines = Math.max(oldLines.length, newLines.length);
		const shownLines = Math.min(maxLines, 10);

		for (let i = 0; i < shownLines; i++) {
			const oldLine = oldLines[i];
			const newLine = newLines[i];
			if (oldLine !== undefined && newLine !== undefined) {
				if (oldLine === newLine) {
					lines.push(`  ${oldLine}`);
				} else {
					lines.push(`- ${oldLine}`);
					lines.push(`+ ${newLine}`);
				}
			} else if (oldLine !== undefined) {
				lines.push(`- ${oldLine}`);
			} else if (newLine !== undefined) {
				lines.push(`+ ${newLine}`);
			}
		}
		if (maxLines > shownLines) {
			lines.push(`... (${maxLines - shownLines} more lines)`);
		}
		lines.push(""); // blank line between edits
	}
	return lines.join("\n");
}

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
