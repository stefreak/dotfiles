/**
 * Tests for the sandbox extension's mode switching and execution behavior.
 *
 * Loads the real extension factory against a fake pi API to verify:
 * - Mode transitions via session_start and /sandbox command
 * - That unsupported platforms gracefully fall back to yolo
 * - That sandbox init failure on a supported platform crashes (never silently runs unsandboxed)
 * - Tool Call Monitoring (Write/Edit Bypasses)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock @anthropic-ai/sandbox-runtime so we control SandboxManager behavior
// ---------------------------------------------------------------------------

const mockInitialize = vi.fn<() => Promise<void>>();
const mockReset = vi.fn<() => Promise<void>>();
const mockWrapWithSandbox = vi.fn<(cmd: string) => Promise<string>>();

vi.mock("@anthropic-ai/sandbox-runtime", () => ({
	SandboxManager: {
		initialize: mockInitialize,
		reset: mockReset,
		wrapWithSandbox: mockWrapWithSandbox,
	},
}));

// ---------------------------------------------------------------------------
// Mock os
// ---------------------------------------------------------------------------

vi.mock("node:os", () => ({
	default: {
		homedir: () => "/home/user",
	},
}));

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
	mockWrapWithSandbox.mockReset();
	mockReset.mockResolvedValue(undefined);
	mockWrapWithSandbox.mockResolvedValue("echo hello");
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
// Unsupported platform → yolo fallback
// ---------------------------------------------------------------------------

describe("unsupported platform", () => {
	it("falls back to yolo via /sandbox command and updates status", async () => {
		const platformSpy = vi
			.spyOn(process, "platform", "get")
			.mockReturnValue("win32" as NodeJS.Platform);

		mockInitialize.mockResolvedValue(undefined);
		const pi = createFakePiAPI();
		const { sandboxCommand } = await loadExtension(pi);
		const ctx = pi.createFakeContext();

		await sandboxCommand.handler("sandboxed", ctx);

		expect(pi.notifications.some((n) => n.message.includes("yolo"))).toBe(true);
		expect(pi.statuses.some((s) => s.text.includes("YOLO"))).toBe(true);

		platformSpy.mockRestore();
	});
});

// ---------------------------------------------------------------------------
// CRITICAL: sandbox init failure on supported platform MUST crash
// ---------------------------------------------------------------------------

describe("sandbox init failure on supported platform", () => {
	it("must not silently run unsandboxed after init failure", async () => {
		// This test reproduces the critical security bug:
		// If SandboxManager.initialize() throws on a supported platform,
		// subsequent execute() calls MUST throw — never silently run unsandboxed.

		const platformSpy = vi
			.spyOn(process, "platform", "get")
			.mockReturnValue("darwin" as NodeJS.Platform);

		mockInitialize.mockRejectedValue(
			new Error("sandbox-exec: command not found"),
		);

		const pi = createFakePiAPI();
		await loadExtension(pi);
		const ctx = pi.createFakeContext();

		// session_start triggers switchMode("sandboxed") which must throw
		// because SandboxManager.initialize fails on a supported platform.
		const sessionStartHandlers = pi.handlers.get("session_start");
		for (const handler of sessionStartHandlers ?? []) {
			await expect(handler({}, ctx)).rejects.toThrow(
				/failed to initialize sandbox/i,
			);
		}

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
