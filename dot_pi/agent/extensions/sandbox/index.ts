/**
 * Sandbox Extension - OS-level sandboxing for bash commands
 *
 * Three modes (cycle with Shift+Tab):
 * - **ask** — no sandbox, but every tool call requires user confirmation.
 *   askOutsideSandbox is redundant (sandbox is already off) and auto-approved.
 * - **sandboxed** — OS-level enforcement (sandbox-exec/bubblewrap).
 *   Read/write allowed in cwd and /tmp. If a command hits restrictions,
 *   re-run with askOutsideSandbox: true to request user permission.
 * - **yolo** — no sandbox, no questions.
 *
 * Usage:
 * - `Shift+Tab` — cycle through ask → sandboxed → yolo → ask
 * - `/sandbox` — show current mode and configuration
 * - `/sandbox ask|sandboxed|yolo` — switch mode directly
 * - `--no-sandbox` flag — force yolo mode at startup
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	type BashOperations,
	createBashTool,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	BYPASS_ALLOW,
	BYPASS_OPTIONS,
	CONFIRM_ALLOW,
	CONFIRM_OPTIONS,
	DEFAULT_RUNTIME_CONFIG,
	modeStatusText,
	type SandboxMode,
	SUPPORTED_PLATFORMS,
	sandboxFooterBrief,
	sandboxFooterFull,
	shouldConfirmTool,
	shouldShowFullFooter,
	unsupportedFooter,
} from "./config.js";

function createSandboxedBashOps(): BashOperations {
	return {
		async exec(command, cwd, { onData, signal, timeout }) {
			if (!existsSync(cwd)) {
				throw new Error(`Working directory does not exist: ${cwd}`);
			}

			const wrappedCommand = await SandboxManager.wrapWithSandbox(command);

			return new Promise((resolve, reject) => {
				const child = spawn("bash", ["-c", wrappedCommand], {
					cwd,
					detached: true,
					stdio: ["ignore", "pipe", "pipe"],
				});

				let timedOut = false;
				let timeoutHandle: NodeJS.Timeout | undefined;

				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) {
							try {
								process.kill(-child.pid, "SIGKILL");
							} catch {
								child.kill("SIGKILL");
							}
						}
					}, timeout * 1000);
				}

				child.stdout?.on("data", onData);
				child.stderr?.on("data", onData);

				child.on("error", (err) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					reject(err);
				});

				const onAbort = () => {
					if (child.pid) {
						try {
							process.kill(-child.pid, "SIGKILL");
						} catch {
							child.kill("SIGKILL");
						}
					}
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
	let unsupportedPlatform: string | undefined;
	let toolCallCount = 0;

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

		currentMode = mode;
		toolCallCount = 0;
		unsupportedPlatform = undefined;

		if (mode === "sandboxed") {
			const platform = process.platform;
			if (!SUPPORTED_PLATFORMS.has(platform)) {
				currentMode = "yolo";
				unsupportedPlatform = platform;
				ctx.ui.setStatus(
					"sandbox",
					`🚀 YOLO mode: not supported on ${platform} (/sandbox)`,
				);
				ctx.ui.notify(
					`Sandbox not supported on ${platform} (yolo mode)`,
					"warning",
				);
				return;
			}

			try {
				await SandboxManager.initialize(DEFAULT_RUNTIME_CONFIG);
				sandboxInitialized = true;
			} catch (err) {
				throw new Error(
					`Failed to initialize sandbox on ${platform}: ${err instanceof Error ? err.message : err}. ` +
						"Refusing to continue without sandbox. Fix the sandbox and restart.",
				);
			}
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
			// Ask mode: no sandbox, but askOutsideSandbox is auto-approved (sandbox is off)
			if (currentMode === "ask") {
				return localBash.execute(id, params, signal, onUpdate);
			}

			// YOLO mode: no sandbox, no questions. askOutsideSandbox is
			// meaningless here (no sandbox to escape), so ignore it.
			// Attach unsupported footer if sandbox is unavailable on this platform.
			if (currentMode === "yolo") {
				if (unsupportedPlatform) {
					const footer = unsupportedFooter(unsupportedPlatform);
					const result = await localBash.execute(id, params, signal, onUpdate);
					return {
						...result,
						content: [
							...(result.content ?? []),
							{ type: "text", text: footer },
						],
					};
				}
				return localBash.execute(id, params, signal, onUpdate);
			}

			// Sandboxed mode: ask the user for bypass approval
			if (params.askOutsideSandbox) {
				const choice = await ctx.ui.select("Sandbox bypass requested", [
					...BYPASS_OPTIONS,
				]);

				if (choice === BYPASS_ALLOW) {
					return localBash.execute(id, params, signal, onUpdate);
				}

				const feedback = await ctx.ui.input(
					"Why deny?",
					"Explain why or suggest an alternative...",
				);
				const reason = feedback
					? `Sandbox bypass denied. Feedback: ${feedback}`
					: "Sandbox bypass denied.";

				throw new Error(reason);
			}

			// Sandboxed execution — crash if sandbox failed to initialize
			// on a supported platform (this should never happen after the fix
			// to switchMode, but belt-and-suspenders).
			if (!sandboxInitialized) {
				throw new Error(
					"BUG: sandbox mode is active but sandbox is not initialized. " +
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
			case "grep":
				return "Search";
			case "find":
				return "Find files";
			case "ls":
				return "List directory";
			default:
				return toolName;
		}
	}

	pi.on("tool_call", async (event, ctx) => {
		if (!shouldConfirmTool(currentMode, event.toolName)) return;

		const label = toolCallLabel(event.toolName);
		const detail = formatToolInput(
			event.toolName,
			event.input as Record<string, unknown>,
		);

		const choice = await ctx.ui.select(`${label}: ${detail}`, [
			...CONFIRM_OPTIONS,
		]);

		if (choice === CONFIRM_ALLOW) return; // proceed with execution

		const feedback = await ctx.ui.input(
			`Why deny ${label.toLowerCase()}?`,
			"Explain why or suggest an alternative...",
		);
		const reason = feedback
			? `${label} denied. Feedback: ${feedback}`
			: `${label} denied.`;

		return { block: true, reason };
	});

	// --- User bash events ---

	pi.on("user_bash", () => {
		if (currentMode !== "sandboxed" || !sandboxInitialized) return;
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

		await switchMode("sandboxed", ctx.cwd, ctx);
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
				"",
				"Available modes:",
				"  ask       — confirm every tool call, no sandbox",
				"  sandboxed — OS-level enforcement, write to . and /tmp",
				"  yolo      — no restrictions, no questions",
				"",
				"Usage: /sandbox <ask|sandboxed|yolo>",
				"Shortcut: Shift+Tab to cycle modes",
			];

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
