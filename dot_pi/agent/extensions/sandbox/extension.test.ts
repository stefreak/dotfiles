/**
 * Tests for the sandbox extension's mode switching and execution behavior.
 *
 * Loads the real extension factory against a fake pi API to verify:
 * - Mode transitions via session_start and /sandbox command
 * - That sandboxed mode NEVER falls back to yolo: startup degrades
 *   loudly to ask mode (every tool call confirmed), explicit switch
 *   requests fail with an actionable error
 * - Windows config passes the vendored srt-win path to initialize()
 * - Tool Call Monitoring (Write/Edit Bypasses)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sandbox-runtime so we control SandboxManager behavior
// ---------------------------------------------------------------------------

const mockInitialize = vi.fn<() => Promise<void>>();
const mockReset = vi.fn<() => Promise<void>>();
const mockWrapWithSandboxArgv =
	vi.fn<
		(
			cmd: string,
			shell: string,
		) => Promise<{ argv: string[]; env: NodeJS.ProcessEnv }>
	>();

const mockVendoredSrtWinExe = "/mock/vendor/srt-win.exe";

class mockWindowsSandboxError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "WindowsSandboxError";
		this.code = code;
	}
}

vi.mock("@anthropic-ai/sandbox-runtime", () => ({
	SandboxManager: {
		initialize: mockInitialize,
		reset: mockReset,
		wrapWithSandboxArgv: mockWrapWithSandboxArgv,
	},
	VENDORED_SRT_WIN_EXE: mockVendoredSrtWinExe,
	WindowsSandboxError: mockWindowsSandboxError,
}));

// ---------------------------------------------------------------------------
// Mock os and fs
// ---------------------------------------------------------------------------

vi.mock("node:os", () => ({
	default: {
		homedir: () => "/home/user",
	},
}));

vi.mock("node:fs", async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import("node:fs");
	return {
		...actual,
		realpathSync: vi.fn((p: string) => p),
		existsSync: vi.fn(() => true),
	};
});

// ---------------------------------------------------------------------------
// Helpers to build a fake pi ExtensionAPI
// ---------------------------------------------------------------------------

interface ToolDefinition {
	name: string;
	label?: string;
	description?: string;
	parameters: unknown;
	execute: (
		id: string,
		params: Record<string, unknown>,
		signal: AbortSignal | undefined,
		onUpdate: unknown,
		ctx: unknown,
	) => Promise<unknown>;
	[key: string]: unknown;
}

function createFakePiAPI() {
	const tools = new Map<string, ToolDefinition>();
	const handlers = new Map<string, Array<(...args: unknown[]) => unknown>>();
	const flags = new Map<string, unknown>();
	const commands = new Map<
		string,
		{ handler: (args: string, ctx: unknown) => Promise<void> }
	>();
	const notifications: Array<{ message: string; level: string }> = [];
	const statuses: Array<{ key: string; text: string }> = [];

	const api = {
		on(event: string, handler: (...args: unknown[]) => unknown) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
		registerTool(tool: ToolDefinition) {
			tools.set(tool.name, tool);
		},
		registerCommand(
			name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			commands.set(name, options);
		},
		registerShortcut() {},
		registerFlag(name: string, options: { default?: unknown }) {
			if (options.default !== undefined && !flags.has(name)) {
				flags.set(name, options.default);
			}
		},
		getFlag(name: string) {
			return flags.get(name);
		},
		events: { on: () => {}, off: () => {} },
	} as unknown as ExtensionAPI;

	return {
		api,
		tools,
		handlers,
		flags,
		commands,
		notifications,
		statuses,
		createFakeContext(overrides: Record<string, unknown> = {}) {
			const ctx = {
				cwd: "/workspace/project",
				ui: {
					setStatus: vi.fn((key: string, text: string) => {
						statuses.push({ key, text });
					}),
					notify: vi.fn((message: string, level: string) => {
						notifications.push({ message, level });
					}),
					select: vi.fn((title: string, _options: string[]) => {
						return new Promise<string | undefined>((resolve) => {
							ctx.pendingSelects.push({
								title,
								resolve: resolve as (choice: string) => void,
							});
						});
					}),
					input: vi.fn(() => {
						return new Promise<string | undefined>((resolve) => {
							ctx.pendingInputs.push({ resolve });
						});
					}),
				},
				pendingSelects: [] as Array<{
					title: string;
					resolve: (choice: string) => void;
				}>,
				pendingInputs: [] as Array<{
					resolve: (value: string | undefined) => void;
				}>,
				...overrides,
			};
			return ctx;
		},
	};
}

type FakePi = ReturnType<typeof createFakePiAPI>;

async function loadExtension(pi: FakePi) {
	const { default: factory } = await import("./index.js");
	factory(pi.api);
	return {
		bashTool: pi.tools.get("bash") as ToolDefinition,
		sandboxCommand: pi.commands.get("sandbox") as {
			handler: (args: string, ctx: unknown) => Promise<void>;
		},
		onToolCall: (pi.handlers.get("tool_call") ?? [])[0] as (
			event: { toolName: string; input: Record<string, unknown> },
			ctx: unknown,
		) => Promise<unknown>,
	};
}

// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
	mockInitialize.mockReset();
	mockReset.mockReset();
	mockWrapWithSandboxArgv.mockReset();
	mockReset.mockResolvedValue(undefined);
	mockWrapWithSandboxArgv.mockResolvedValue({
		argv: ["/bin/bash", "-c", "echo hello"],
		env: process.env,
	});
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------

describe("extension registration", () => {
	it("registers the bash tool", async () => {
		mockInitialize.mockResolvedValue(undefined);
		const pi = createFakePiAPI();
		const { bashTool } = await loadExtension(pi);
		expect(bashTool).toBeDefined();
		expect(bashTool.name).toBe("bash");
	});
});

// ---------------------------------------------------------------------------
// Sandbox mode must NEVER silently degrade to yolo
// ---------------------------------------------------------------------------

describe("unsupported platform", () => {
	it("explicit switch request is refused instead of falling back to yolo", async () => {
		const platformSpy = vi
			.spyOn(process, "platform", "get")
			.mockReturnValue("freebsd" as NodeJS.Platform);

		mockInitialize.mockResolvedValue(undefined);
		const pi = createFakePiAPI();
		const { sandboxCommand } = await loadExtension(pi);
		const ctx = pi.createFakeContext();

		await expect(sandboxCommand.handler("sandboxed", ctx)).rejects.toThrow(
			/not supported on freebsd/,
		);
		// No yolo status may be set as a silent fallback
		expect(pi.statuses.some((s) => s.text.includes("YOLO"))).toBe(false);

		platformSpy.mockRestore();
	});

	it("startup falls back to ask mode loudly (never yolo)", async () => {
		const platformSpy = vi
			.spyOn(process, "platform", "get")
			.mockReturnValue("freebsd" as NodeJS.Platform);

		mockInitialize.mockResolvedValue(undefined);
		const pi = createFakePiAPI();
		await loadExtension(pi);
		const ctx = pi.createFakeContext();

		const sessionStartHandlers = pi.handlers.get("session_start");
		for (const handler of sessionStartHandlers ?? []) {
			await handler({}, ctx); // must not throw
		}

		expect(
			pi.statuses.some((s) => s.text.includes("Ask mode (fallback)")),
		).toBe(true);
		expect(pi.statuses.some((s) => s.text.includes("YOLO"))).toBe(false);
		expect(pi.notifications.some((n) => n.level === "error")).toBe(true);

		platformSpy.mockRestore();
	});
});

describe("windows platform", () => {
	it("sandboxed mode works when initialize succeeds", async () => {
		const platformSpy = vi
			.spyOn(process, "platform", "get")
			.mockReturnValue("win32" as NodeJS.Platform);

		mockInitialize.mockResolvedValue(undefined);
		const pi = createFakePiAPI();
		const { sandboxCommand } = await loadExtension(pi);
		const ctx = pi.createFakeContext();

		await sandboxCommand.handler("sandboxed", ctx);

		// 0.0.73 requires the srt-win broker path explicitly — the
		// extension must pass the vendored binary shipped with the package.
		expect(mockInitialize).toHaveBeenCalledWith(
			expect.objectContaining({
				windows: expect.objectContaining({
					srtWin: expect.objectContaining({ path: mockVendoredSrtWinExe }),
				}),
			}),
		);
		expect(pi.statuses.some((s) => s.text.includes("Sandboxed"))).toBe(true);
		expect(pi.notifications.some((n) => n.message.includes("yolo"))).toBe(
			false,
		);

		platformSpy.mockRestore();
	});

	it("missing windows-install: startup falls back to ask loudly, explicit switch throws with fix hint", async () => {
		const platformSpy = vi
			.spyOn(process, "platform", "get")
			.mockReturnValue("win32" as NodeJS.Platform);

		// Mirrors the library's WindowsSandboxError('not_provisioned')
		mockInitialize.mockRejectedValue(
			new mockWindowsSandboxError(
				"not_provisioned",
				"Windows sandbox user is not provisioned. Run `npx sandbox-runtime windows-install` (one UAC prompt) to provision it.",
			),
		);

		const pi = createFakePiAPI();
		const { sandboxCommand } = await loadExtension(pi);
		const ctx = pi.createFakeContext();

		// Startup: loud ask fallback, no throw
		const sessionStartHandlers = pi.handlers.get("session_start");
		for (const handler of sessionStartHandlers ?? []) {
			await handler({}, ctx);
		}
		expect(
			pi.statuses.some((s) => s.text.includes("Ask mode (fallback)")),
		).toBe(true);
		expect(
			pi.notifications.some(
				(n) => n.level === "error" && n.message.includes("windows-install"),
			),
		).toBe(true);

		// Explicit request: throws with the library error + a fix hint
		await expect(sandboxCommand.handler("sandboxed", ctx)).rejects.toThrow(
			/windows-install/,
		);
		await expect(sandboxCommand.handler("sandboxed", ctx)).rejects.toThrow(
			/Fix:/,
		);

		platformSpy.mockRestore();
	});

	it("missing srt-win binary: explicit switch mentions reinstalling dependencies", async () => {
		const platformSpy = vi
			.spyOn(process, "platform", "get")
			.mockReturnValue("win32" as NodeJS.Platform);

		mockInitialize.mockRejectedValue(
			new mockWindowsSandboxError(
				"srt_win_not_found",
				"no srt-win path configured; set windows.srtWin.path",
			),
		);

		const pi = createFakePiAPI();
		const { sandboxCommand } = await loadExtension(pi);
		const ctx = pi.createFakeContext();

		await expect(sandboxCommand.handler("sandboxed", ctx)).rejects.toThrow(
			/npm ci/,
		);

		platformSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// Sandbox init failure at startup MUST degrade to ask mode (never yolo),
// surface the failure, and keep confirming every tool call
// ---------------------------------------------------------------------------

describe("sandbox init failure at startup", () => {
	it("falls back to ask mode, surfaces the error, and confirms every tool call", async () => {
		const platformSpy = vi
			.spyOn(process, "platform", "get")
			.mockReturnValue("darwin" as NodeJS.Platform);

		mockInitialize.mockRejectedValue(
			new Error("sandbox-exec: command not found"),
		);

		const pi = createFakePiAPI();
		const { onToolCall } = await loadExtension(pi);
		const ctx = pi.createFakeContext();

		// session_start must not throw — it degrades to ask mode
		const sessionStartHandlers = pi.handlers.get("session_start");
		for (const handler of sessionStartHandlers ?? []) {
			await handler({}, ctx);
		}

		expect(
			pi.statuses.some((s) => s.text.includes("Ask mode (fallback)")),
		).toBe(true);
		expect(pi.statuses.some((s) => s.text.includes("YOLO"))).toBe(false);
		expect(
			pi.notifications.some(
				(n) =>
					n.level === "error" &&
					n.message.includes("falling back to ask mode") &&
					n.message.includes("sandbox-exec: command not found"),
			),
		).toBe(true);

		// Ask mode confirms every tool call — nothing runs without
		// explicit approval.
		const result = onToolCall(
			{ toolName: "bash", input: { command: "echo hi" } },
			ctx,
		);
		await new Promise((r) => setTimeout(r, 10));
		expect(ctx.pendingSelects).toHaveLength(1);
		ctx.pendingSelects[0].resolve("✅ Allow");
		await result;

		platformSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// Tool Call Monitoring (Write/Edit Bypasses)
// ---------------------------------------------------------------------------

describe("tool call monitoring", () => {
	async function setup() {
		const pi = createFakePiAPI();
		const ext = await loadExtension(pi);
		const ctx = pi.createFakeContext();

		// session_start initializes sandboxed mode
		for (const handler of pi.handlers.get("session_start") ?? []) {
			await handler({}, ctx);
		}

		return { pi, ...ext, ctx };
	}

	it("write to cwd should NOT trigger a dialog", async () => {
		const { onToolCall, ctx } = await setup();

		const result = await onToolCall(
			{
				toolName: "write",
				input: { path: "/workspace/project/src/index.ts", content: "hello" },
			},
			ctx,
		);

		expect(result).toBeUndefined();
		expect(ctx.pendingSelects).toHaveLength(0);
	});

	it("write to /tmp should NOT trigger a dialog", async () => {
		const { onToolCall, ctx } = await setup();

		const result = await onToolCall(
			{
				toolName: "write",
				input: { path: "/tmp/test-file.ts", content: "hello" },
			},
			ctx,
		);

		expect(result).toBeUndefined();
		expect(ctx.pendingSelects).toHaveLength(0);
	});

	it("write to path outside cwd and /tmp MUST trigger a dialog", async () => {
		const { onToolCall, ctx } = await setup();

		const resultPromise = onToolCall(
			{
				toolName: "write",
				input: { path: "/etc/config.conf", content: "malicious" },
			},
			ctx,
		);

		await new Promise((r) => setTimeout(r, 10));
		expect(ctx.pendingSelects).toHaveLength(1);
		expect(ctx.pendingSelects[0].title).toContain("write");
		expect(ctx.pendingSelects[0].title).toContain("/etc/config.conf");

		ctx.pendingSelects[0].resolve("✅ Allow — run outside sandbox");
		await resultPromise;
	});

	it("write to denied path (e.g. .env) MUST trigger a dialog even if in cwd", async () => {
		const { onToolCall, ctx } = await setup();

		const resultPromise = onToolCall(
			{
				toolName: "write",
				input: { path: "/workspace/project/.env", content: "SECRET=xyz" },
			},
			ctx,
		);

		await new Promise((r) => setTimeout(r, 10));
		expect(ctx.pendingSelects).toHaveLength(1);

		ctx.pendingSelects[0].resolve("✅ Allow — run outside sandbox");
		await resultPromise;
	});

	it("edit to path outside cwd and /tmp MUST trigger a dialog", async () => {
		const { onToolCall, ctx } = await setup();

		const resultPromise = onToolCall(
			{
				toolName: "edit",
				input: {
					path: "/usr/local/bin/something",
					edits: [{ oldText: "foo", newText: "bar" }],
				},
			},
			ctx,
		);

		await new Promise((r) => setTimeout(r, 10));
		expect(ctx.pendingSelects).toHaveLength(1);

		ctx.pendingSelects[0].resolve("✅ Allow — run outside sandbox");
		await resultPromise;
	});

	it("read from restricted path MUST trigger a dialog", async () => {
		const { onToolCall, ctx } = await setup();

		const resultPromise = onToolCall(
			{
				toolName: "read",
				input: { path: "/home/user/.ssh/id_rsa" },
			},
			ctx,
		);

		await new Promise((r) => setTimeout(r, 10));
		expect(ctx.pendingSelects).toHaveLength(1);
		expect(ctx.pendingSelects[0].title).toContain("read");
		expect(ctx.pendingSelects[0].title).toContain("/home/user/.ssh/id_rsa");

		ctx.pendingSelects[0].resolve("✅ Allow — run outside sandbox");
		await resultPromise;
	});

	it("read from a SYMLINK to a restricted path MUST trigger a dialog", async () => {
		const { onToolCall, ctx } = await setup();
		const fs = await import("node:fs");

		// Mock the symlink resolution: /tmp/link -> /home/user/.ssh/id_rsa
		vi.mocked(fs.realpathSync).mockImplementation((p) => {
			const pathStr = p.toString();
			if (pathStr === "/tmp/link") return "/home/user/.ssh/id_rsa";
			return pathStr;
		});

		const resultPromise = onToolCall(
			{
				toolName: "read",
				input: { path: "/tmp/link" },
			},
			ctx,
		);

		await new Promise((r) => setTimeout(r, 10));
		expect(ctx.pendingSelects).toHaveLength(1);
		expect(ctx.pendingSelects[0].title).toContain("read");
		// The title should show the original path or the resolved one?
		// Current implementation resolves it before checking.
		// Let's check what the code does.

		ctx.pendingSelects[0].resolve("✅ Allow — run outside sandbox");
		await resultPromise;
	});

	it("denied write shows feedback in error", async () => {
		const { onToolCall, ctx } = await setup();

		const resultPromise = onToolCall(
			{
				toolName: "write",
				input: { path: "/etc/config.conf", content: "malicious" },
			},
			ctx,
		);

		await new Promise((r) => setTimeout(r, 10));
		ctx.pendingSelects[0].resolve("❌ Deny");

		await new Promise((r) => setTimeout(r, 10));
		ctx.pendingInputs[0].resolve("security risk");

		await expect(resultPromise).rejects.toThrow(
			"File write denied. Feedback: security risk",
		);
	});
});
