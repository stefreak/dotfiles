/**
 * Sandbox Extension - OS-level sandboxing for bash commands
 *
 * Three modes (cycle with Shift+Tab):
 * - **ask** — no sandbox, but every tool call requires user confirmation.
 *   askOutsideSandbox is redundant (sandbox is already off) and auto-
 *   approved. Also the startup fallback when the sandbox cannot be
 *   initialized (the failure is surfaced loudly; never yolo).
 * - **sandboxed** — OS-level enforcement (sandbox-exec on macOS,
 *   bubblewrap on Linux, srt-win on Windows — alpha: dedicated sandbox
 *   user, NTFS ACLs + WFP egress fence, one-time `windows-install` setup).
 *   Read/write allowed in cwd and the system temp dir. If a command hits
 *   restrictions, re-run with askOutsideSandbox: true to request user
 *   permission. An explicit switch request (Shift+Tab, /sandbox
 *   sandboxed) that fails to initialize throws with an actionable error
 *   and leaves the current mode unchanged.
 * - **yolo** — no sandbox, no questions.
 *
 * Usage:
 * - `Shift+Tab` — cycle through ask → sandboxed → yolo → ask
 * - `/sandbox` — show current mode and configuration
 * - `/sandbox ask|sandboxed|yolo` — switch mode directly
 * - `--no-sandbox` flag — force yolo mode at startup
 */

import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import * as path from "node:path";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";
import {
	SandboxManager,
	VENDORED_SRT_WIN_EXE,
	WindowsSandboxError,
} from "@anthropic-ai/sandbox-runtime";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	type BashOperations,
	createBashTool,
	getShellConfig,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	BYPASS_ALLOW,
	BYPASS_OPTIONS,
	CONFIRM_ALLOW,
	CONFIRM_OPTIONS,
	DEFAULT_RUNTIME_CONFIG,
	isReadRestricted,
	isWriteRestricted,
	modeStatusText,
	runtimeConfigForPlatform,
	type SandboxMode,
	SUPPORTED_PLATFORMS,
	sandboxFooterBrief,
	sandboxFooterFull,
	shouldConfirmTool,
	shouldShowFullFooter,
	WRITE_TOOLS,
} from "./config.js";

/**
 * Resolve symlinks in a path, even if the file doesn't exist.
 * Resolves as much of the path as possible by traversing upwards.
 */
function safeRealpath(absPath: string): string {
	try {
		return realpathSync(absPath);
	} catch {
		const parent = path.dirname(absPath);
		if (parent === absPath) return absPath; // Root
		return path.join(safeRealpath(parent), path.basename(absPath));
	}
}

/**
 * Kill a spawned process and its entire tree.
 * Unix: SIGKILL the process group (children are spawned detached).
 * Windows: taskkill /T (process groups don't exist).
 */
function killProcessTree(pid: number): void {
	if (process.platform === "win32") {
		// detached: don't wait on taskkill to keep the event loop open
		spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
			stdio: "ignore",
			detached: true,
			windowsHide: true,
		});
		return;
	}
	try {
		process.kill(-pid, "SIGKILL");
	} catch {
		// Process group already gone — try the child directly.
		// ESRCH (already dead) is the expected exit of cleanup.
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// Process already dead
		}
	}
}

/**
 * Runtime config for the host platform. On Windows, 0.0.73 requires the
 * srt-win broker path explicitly (the packaged binary is not
 * auto-resolved), so point it at the vendored exe shipped with the
 * npm package.
 */
function runtimeConfigForHost(): SandboxRuntimeConfig {
	const cfg = runtimeConfigForPlatform(process.platform);
	if (process.platform !== "win32") return cfg;
	return {
		...cfg,
		windows: { srtWin: { path: VENDORED_SRT_WIN_EXE } },
	};
}

/**
 * Short actionable follow-up for a sandbox init failure. Branches on the
 * library's typed WindowsSandboxError where possible; the library's own
 * message already carries setup details for provisioning failures.
 */
function sandboxFailureHint(platform: NodeJS.Platform, err: unknown): string {
	if (platform === "win32") {
		if (err instanceof WindowsSandboxError) {
			if (err.code === "srt_win_not_found") {
				return (
					"Fix: reinstall the extension's dependencies (npm ci in the " +
					"extension directory), then /sandbox sandboxed."
				);
			}
			if (err.code === "not_provisioned" || err.code === "wfp_fence_inactive") {
				return (
					"Fix: run `npx @anthropic-ai/sandbox-runtime windows-install` " +
					"(one UAC prompt), then /sandbox sandboxed."
				);
			}
		}
		return (
			"Fix: run `npx @anthropic-ai/sandbox-runtime windows-install` " +
			"(one UAC prompt), ensure Git Bash is installed, then /sandbox sandboxed."
		);
	}
	if (platform === "linux") {
		return "Fix: install bubblewrap and socat, then /sandbox sandboxed.";
	}
	return "Fix: after repairing the environment, run /sandbox sandboxed.";
}

function createSandboxedBashOps(): BashOperations {
	return {
		async exec(command, cwd, { onData, signal, timeout }) {
			if (!existsSync(cwd)) {
				throw new Error(`Working directory does not exist: ${cwd}`);
			}

			// wrapWithSandboxArgv returns a platform-correct spawn descriptor:
			// macOS/Linux → [shell, "-c", <wrapped>]; Windows → the bundled
			// srt-win.exe broker argv + env (the string wrapWithSandbox is not
			// supported on Windows). The inner shell is resolved exactly like
			// pi's native bash tool (Git Bash on Windows, /bin/bash on Unix).
			const { shell } = getShellConfig();
			const { argv, env } = await SandboxManager.wrapWithSandboxArgv(
				command,
				shell,
				undefined,
				signal,
				cwd,
			);

			return new Promise((resolve, reject) => {
				const child = spawn(argv[0], argv.slice(1), {
					cwd,
					env,
					detached: process.platform !== "win32",
					stdio: ["ignore", "pipe", "pipe"],
					windowsHide: true,
				});

				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) killProcessTree(child.pid);
					}, timeout * 1000);
				}

				child.stdout?.on("data", onData);
				child.stderr?.on("data", onData);

				child.on("error", (err) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					reject(err);
				});

				const onAbort = () => {
					if (child.pid) killProcessTree(child.pid);
				};

				signal?.addEventListener("abort", onAbort, { once: true });

				child.on("close", (code) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					signal?.removeEventListener("abort", onAbort);

					if (signal?.aborted) {
						reject(new Error("aborted"));
					} else if (timedOut) {
						reject(new Error(`timeout:${timeout}`));
					} else {
						resolve({ exitCode: code });
					}
				});
			});
		},
	};
}

const MODES: SandboxMode[] = ["ask", "sandboxed", "yolo"];

function nextMode(current: SandboxMode): SandboxMode {
	const idx = MODES.indexOf(current);
	return MODES[(idx + 1) % MODES.length];
}

export default function (pi: ExtensionAPI) {
	pi.registerFlag("no-sandbox", {
		description: "Disable OS-level sandboxing (forces yolo mode)",
		type: "boolean",
		default: false,
	});

	const localCwd = process.cwd();
	const localBash = createBashTool(localCwd);

	let currentMode: SandboxMode = "sandboxed";
	let sandboxInitialized = false;
	let toolCallCount = 0;
	// Reason the sandbox is unavailable (set when startup falls back to
	// ask mode); shown by /sandbox so the failure is never silent.
	let sandboxFailReason: string | undefined;

	// Serialize UI dialogs (select/input) so concurrent requests don't
	// overwrite each other in the TUI (only one dialog slot exists).
	// Counter resets when the queue drains (new batch).
	let dialogQueue: Promise<unknown> = Promise.resolve();
	let dialogPending = 0;
	let dialogTotal = 0;

	/**
	 * Show a confirmation dialog, serialized via the dialog queue.
	 * Returns true if approved, throws on deny.
	 * Counter resets between batches (when queue drains).
	 */
	function confirmDialog(
		ctx: ExtensionContext | ExtensionCommandContext,
		title: string,
		options: readonly string[],
		allowOption: string,
		denyPrompt: string,
		errorPrefix: string,
	): Promise<boolean> {
		dialogPending++;
		dialogTotal++;
		const index = dialogTotal;

		return new Promise<boolean>((resolve, reject) => {
			dialogQueue = dialogQueue
				.catch(() => {}) // Recover from previous rejection (denial)
				.then(async () => {
					const choice = await ctx.ui.select(
						`[${index}/${dialogTotal}] ${title}`,
						[...options],
					);

					if (choice === allowOption) {
						resolve(true);
						return;
					}

					const feedback = await ctx.ui.input(
						denyPrompt,
						"Explain why or suggest an alternative...",
					);
					throw new Error(
						feedback ? `${errorPrefix} Feedback: ${feedback}` : errorPrefix,
					);
				})
				.then(undefined, reject)
				.finally(() => {
					dialogPending--;
					if (dialogPending === 0) dialogTotal = 0;
				});
		});
	}

	const sandboxedParams = Type.Object({
		command: Type.String({ description: "Bash command to execute" }),
		timeout: Type.Optional(
			Type.Number({
				description: "Timeout in seconds (optional, no default timeout)",
			}),
		),
		askOutsideSandbox: Type.Optional(
			Type.Boolean({
				description:
					"Set to true to request user permission to run this command outside the sandbox.",
			}),
		),
	});

	const BASH_DESCRIPTION =
		"Execute a bash command in the current sandbox mode.";

	// --- Switch mode (shared logic for shortcut and command) ---

	async function switchMode(
		mode: SandboxMode,
		_cwd: string,
		ctx: ExtensionContext | ExtensionCommandContext,
	) {
		// Tear down existing sandbox
		if (sandboxInitialized) {
			await SandboxManager.reset();
			sandboxInitialized = false;
		}

		toolCallCount = 0;
		sandboxFailReason = undefined;

		if (mode === "sandboxed") {
			const platform = process.platform;
			if (!SUPPORTED_PLATFORMS.has(platform)) {
				// Never silently degrade: sandboxed was requested, so fail
				// loudly instead of dropping to yolo.
				throw new Error(
					`Sandbox is not supported on ${platform}. ` +
						"Restart with --no-sandbox to run without sandboxing.",
				);
			}

			try {
				await SandboxManager.initialize(runtimeConfigForHost());
			} catch (err) {
				// Same rule: an unsandboxed session is never the silent
				// fallback. On Windows the library's message already
				// carries setup details for provisioning failures; the
				// hint adds the next concrete step.
				const detail = err instanceof Error ? err.message : String(err);
				throw new Error(
					`Failed to initialize sandbox on ${platform}: ${detail}\n` +
						sandboxFailureHint(platform, err),
				);
			}
			sandboxInitialized = true;
			currentMode = mode;
		} else {
			currentMode = mode;
		}

		ctx.ui.setStatus("sandbox", modeStatusText(currentMode));
		ctx.ui.notify(`${currentMode} mode`, "info");
	}

	// --- Get the appropriate sandbox footer ---

	function getSandboxFooter(): string {
		toolCallCount++;
		if (shouldShowFullFooter(toolCallCount)) {
			return sandboxFooterFull();
		}
		return sandboxFooterBrief();
	}

	// --- Register the sandboxed bash tool ---

	pi.registerTool({
		...localBash,
		name: "bash",
		label: "bash (sandboxed)",
		description: BASH_DESCRIPTION,
		parameters: sandboxedParams,

		async execute(id, params, signal, onUpdate, ctx) {
			const snapshot = {
				mode: currentMode,
				init: sandboxInitialized,
			};

			// Ask mode: no sandbox, but askOutsideSandbox is auto-approved (sandbox is off)
			if (snapshot.mode === "ask") {
				return localBash.execute(id, params, signal, onUpdate);
			}

			// YOLO mode: no sandbox, no questions. askOutsideSandbox is
			// meaningless here (no sandbox to escape), so ignore it.
			if (snapshot.mode === "yolo") {
				return localBash.execute(id, params, signal, onUpdate);
			}

			// Sandboxed mode: ask the user for bypass approval (serialized so
			// concurrent dialogs don't overwrite each other in the UI).
			// Approval is queued, execution runs after (parallel with next
			// dialog).
			if (params.askOutsideSandbox) {
				const approved = await confirmDialog(
					ctx,
					"Sandbox bypass",
					BYPASS_OPTIONS,
					BYPASS_ALLOW,
					"Why deny?",
					"Sandbox bypass denied.",
				);
				if (approved) {
					return localBash.execute(id, params, signal, onUpdate);
				}
			}

			// Sandboxed execution — crash if the sandbox is not initialized
			// (unsupported platform or failed initialize; switchMode throws,
			// but belt-and-suspenders: never run unsandboxed).
			if (!snapshot.init) {
				throw new Error(
					"Sandbox mode is active but the sandbox is not initialized. " +
						"Refusing to execute without sandbox.",
				);
			}

			const ops = createSandboxedBashOps();
			const sandboxedBash = createBashTool(localCwd, { operations: ops });
			const footer = getSandboxFooter();

			try {
				const result = await sandboxedBash.execute(
					id,
					params,
					signal,
					onUpdate,
				);
				return {
					...result,
					content: [...(result.content ?? []), { type: "text", text: footer }],
				};
			} catch (err) {
				if (err instanceof Error) {
					throw new Error(`${err.message}\n\n${footer}`);
				}
				throw err;
			}
		},
	});

	// --- Confirm tools in ask mode ---

	function formatToolInput(
		toolName: string,
		input: Record<string, unknown>,
	): string {
		if (toolName === "bash") return String(input.command ?? "(no command)");
		if (toolName === "write")
			return `${input.path ?? "?"} (${String(input.content ?? "").length} chars)`;
		if (toolName === "read") return String(input.path ?? "?");
		if (toolName === "edit") return String(input.path ?? "?");
		return JSON.stringify(input);
	}

	function toolCallLabel(toolName: string): string {
		switch (toolName) {
			case "bash":
				return "Bash command";
			case "edit":
				return "File edit";
			case "write":
				return "File write";
			case "read":
				return "File read";
			default:
				return toolName;
		}
	}

	pi.on("tool_call", async (event, ctx) => {
		const toolName = event.toolName;
		const isSandboxedMode = currentMode === "sandboxed";

		let needsConfirmation = shouldConfirmTool(currentMode, toolName);
		let isBypass = false;

		const homeDir = safeRealpath(os.homedir());

		// In sandboxed mode, restricted reads and writes need bypass approval
		if (isSandboxedMode) {
			const input = event.input as { path?: string };
			if (input.path) {
				const absPath = path.resolve(ctx.cwd, input.path);
				const resolvedPath = safeRealpath(absPath);
				const resolvedCwd = safeRealpath(ctx.cwd);

				if (WRITE_TOOLS.has(toolName)) {
					if (isWriteRestricted(resolvedPath, resolvedCwd, homeDir)) {
						needsConfirmation = true;
						isBypass = true;
					}
				} else if (toolName === "read") {
					if (isReadRestricted(resolvedPath, homeDir)) {
						needsConfirmation = true;
						isBypass = true;
					}
				}
			}
		}

		if (!needsConfirmation) return;

		const label = toolCallLabel(toolName);
		const detail = formatToolInput(
			toolName,
			event.input as Record<string, unknown>,
		);

		const options = isBypass ? BYPASS_OPTIONS : CONFIRM_OPTIONS;
		const allow = isBypass ? BYPASS_ALLOW : CONFIRM_ALLOW;
		const title = isBypass
			? `Sandbox bypass: ${label} ${detail}`
			: `${label}: ${detail}`;

		await confirmDialog(
			ctx,
			title,
			options,
			allow,
			isBypass ? "Why deny?" : `Why deny ${label.toLowerCase()}?`,
			`${label} denied.`,
		);

		// If we reached here, it was approved (otherwise confirmDialog would have thrown)
		return undefined;
	});

	// --- User bash events ---

	pi.on("user_bash", () => {
		if (currentMode !== "sandboxed") return;
		if (!sandboxInitialized) {
			throw new Error(
				"Sandbox mode is active but the sandbox is not initialized. " +
					"Refusing to run user bash without sandbox.",
			);
		}
		return { operations: createSandboxedBashOps() };
	});

	// --- Session lifecycle ---

	pi.on("session_start", async (_event, ctx) => {
		const noSandbox = pi.getFlag("no-sandbox") as boolean;

		if (noSandbox) {
			await switchMode("yolo", ctx.cwd, ctx);
			ctx.ui.setStatus(
				"sandbox",
				"🚀 YOLO mode: no restrictions --no-sandbox (/sandbox)",
			);
			ctx.ui.notify("Sandbox disabled via --no-sandbox (yolo mode)", "warning");
			return;
		}

		try {
			await switchMode("sandboxed", ctx.cwd, ctx);
		} catch (err) {
			// The default mode is unavailable. Degrade to ask — every tool
			// call requires human approval — never to yolo. Surface the
			// failure loudly so the startup is never silent.
			currentMode = "ask";
			sandboxFailReason = err instanceof Error ? err.message : String(err);
			ctx.ui.setStatus(
				"sandbox",
				"⚠️ Ask mode (fallback): sandbox unavailable (/sandbox)",
			);
			ctx.ui.notify(
				`Sandbox unavailable — falling back to ask mode (every tool call requires approval).\n${sandboxFailReason}`,
				"error",
			);
		}
	});

	pi.on("session_shutdown", async () => {
		if (sandboxInitialized) {
			await SandboxManager.reset();
			sandboxInitialized = false;
		}
	});

	// --- Shift+Tab to cycle modes ---

	pi.registerShortcut("shift+tab", {
		description: "Cycle sandbox mode (ask → sandboxed → yolo)",
		handler: async (ctx) => {
			const target = nextMode(currentMode);
			await switchMode(target, ctx.cwd, ctx);
		},
	});

	// --- /sandbox command ---

	pi.registerCommand("sandbox", {
		description: "Show or change sandbox mode (ask | sandboxed | yolo)",
		handler: async (args, ctx) => {
			const trimmed = (args ?? "").trim();

			// Switch mode
			if (trimmed === "ask" || trimmed === "sandboxed" || trimmed === "yolo") {
				await switchMode(trimmed, ctx.cwd, ctx);
				return;
			}

			// Show status
			const lines = [
				`Mode: ${currentMode}`,
				`Status: ${modeStatusText(currentMode)}`,
			];

			if (sandboxFailReason) {
				lines.push(
					"",
					`Sandbox unavailable: ${sandboxFailReason}`,
					"Re-enable with /sandbox sandboxed once fixed.",
				);
			}

			lines.push(
				"",
				"Available modes:",
				"  ask       — confirm every tool call, no sandbox",
				"  sandboxed — OS-level enforcement, write to . and the temp dir",
				"  yolo      — no restrictions, no questions (requires explicit --no-sandbox)",
				"",
				"Usage: /sandbox <ask|sandboxed|yolo>",
				"Shortcut: Shift+Tab to cycle modes",
			);

			if (currentMode === "sandboxed") {
				lines.push(
					"",
					"Current configuration:",
					"",
					"Network:",
					`  Allowed: ${DEFAULT_RUNTIME_CONFIG.network.allowedDomains.join(", ")}`,
					`  Denied: ${DEFAULT_RUNTIME_CONFIG.network.deniedDomains.join(", ") || "(none)"}`,
					"",
					"Filesystem:",
					`  Deny Read: ${DEFAULT_RUNTIME_CONFIG.filesystem.denyRead.join(", ")}`,
					`  Allow Write: ${DEFAULT_RUNTIME_CONFIG.filesystem.allowWrite.join(", ")}`,
					`  Deny Write: ${DEFAULT_RUNTIME_CONFIG.filesystem.denyWrite.join(", ")}`,
				);
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
