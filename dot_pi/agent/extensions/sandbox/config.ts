/**
 * Pure logic for the sandbox extension — no pi or OS dependencies.
 * Extracted for testability.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

export type SandboxMode = "ask" | "sandboxed" | "yolo";

export interface SandboxConfig extends SandboxRuntimeConfig {
	enabled?: boolean;
	mode?: SandboxMode;
}

export const DEFAULT_CONFIG: SandboxConfig = {
	enabled: true,
	mode: "sandboxed",
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
		denyWrite: [".env", ".env.*", "*.pem", "*.key", "**/node_modules/**", "**/vendor/**", "**/__pycache__/**", "**/.venv/**", "**/.git/**"],
	},
};


/**
 * Deep merge sandbox config. Project overrides global overrides defaults.
 */
export function deepMerge(base: SandboxConfig, overrides: Partial<SandboxConfig>): SandboxConfig {
	const result: SandboxConfig = { ...base };

	if (overrides.enabled !== undefined) result.enabled = overrides.enabled;
	if (overrides.mode !== undefined) result.mode = overrides.mode;
	if (overrides.network) {
		result.network = { ...base.network, ...overrides.network };
	}
	if (overrides.filesystem) {
		result.filesystem = { ...base.filesystem, ...overrides.filesystem };
	}

	const extOverrides = overrides as {
		ignoreViolations?: Record<string, string[]>;
		enableWeakerNestedSandbox?: boolean;
	};
	const extResult = result as { ignoreViolations?: Record<string, string[]>; enableWeakerNestedSandbox?: boolean };

	if (extOverrides.ignoreViolations) {
		extResult.ignoreViolations = extOverrides.ignoreViolations;
	}
	if (extOverrides.enableWeakerNestedSandbox !== undefined) {
		extResult.enableWeakerNestedSandbox = extOverrides.enableWeakerNestedSandbox;
	}

	return result;
}

/**
 * Load and merge config from global and project paths.
 * Both paths are optional — if a file doesn't exist, it's skipped.
 */
export function loadConfigFromPaths(globalConfigPath: string, projectConfigPath: string): SandboxConfig {
	let globalConfig: Partial<SandboxConfig> = {};
	let projectConfig: Partial<SandboxConfig> = {};

	if (existsSync(globalConfigPath)) {
		try {
			globalConfig = JSON.parse(readFileSync(globalConfigPath, "utf-8"));
		} catch (e) {
			console.error(`Warning: Could not parse ${globalConfigPath}: ${e}`);
		}
	}

	if (existsSync(projectConfigPath)) {
		try {
			projectConfig = JSON.parse(readFileSync(projectConfigPath, "utf-8"));
		} catch (e) {
			console.error(`Warning: Could not parse ${projectConfigPath}: ${e}`);
		}
	}

	return deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig);
}

/**
 * Build the sandbox runtime config for a given mode.
 * Returns null for yolo mode (no sandbox needed).
 */
export function getSandboxRuntimeConfigForMode(
	mode: SandboxMode,
	config: SandboxConfig,
): (SandboxRuntimeConfig & { ignoreViolations?: Record<string, string[]>; enableWeakerNestedSandbox?: boolean }) | null {
	if (mode === "yolo") return null;

	const sandboxConfig: SandboxRuntimeConfig & {
		ignoreViolations?: Record<string, string[]>;
		enableWeakerNestedSandbox?: boolean;
	} = {};

	sandboxConfig.network = config.network;
	if (mode === "ask") {
		sandboxConfig.filesystem = { denyRead: [], allowWrite: [], denyWrite: [] };
	} else {
		sandboxConfig.filesystem = config.filesystem;
	}

	const configExt = config as unknown as {
		ignoreViolations?: Record<string, string[]>;
		enableWeakerNestedSandbox?: boolean;
	};
	if (configExt.ignoreViolations) sandboxConfig.ignoreViolations = configExt.ignoreViolations;
	if (configExt.enableWeakerNestedSandbox !== undefined)
		sandboxConfig.enableWeakerNestedSandbox = configExt.enableWeakerNestedSandbox;

	return sandboxConfig;
}

export const WRITE_TOOLS = new Set(["write", "edit"]);

/**
 * Select dialog options for sandbox bypass approval.
 * These are strings because ctx.ui.select() takes string[], not objects.
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
export const CONFIRM_OPTIONS = [
	"✅ Allow",
	"❌ Deny",
] as const;

export const CONFIRM_ALLOW = CONFIRM_OPTIONS[0];
export const CONFIRM_DENY = CONFIRM_OPTIONS[1];

/**
 * Format an edit tool's input as a diff-style summary.
 * Shows up to 10 lines per edit block with -/+ prefixes.
 */
export function formatEditDiff(input: { edits?: Array<{ oldText?: string; newText?: string }> }): string {
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
 * In ask mode, only write/edit tools need confirmation — bash runs
 * sandboxed (read-only) and escalates via askOutsideSandbox.
 */
export function shouldConfirmTool(mode: SandboxMode, toolName: string): boolean {
	if (mode !== "ask") return false;
	return WRITE_TOOLS.has(toolName);
}

/**
 * Human-readable status text for a mode.
 */
export function modeStatusText(mode: SandboxMode, config: SandboxConfig): string {
	switch (mode) {
		case "ask":
			return "🔐 Ask mode: confirm writes, read-only sandbox (/sandbox)";
		case "sandboxed": {
			const writeCount = config.filesystem?.allowWrite?.length ?? 0;
			return "🎪 Sandboxed mode: play within boundaries (/sandbox)";
		}
		case "yolo":
			return "🚀 YOLO mode: no restrictions, no questions";
	}
}
