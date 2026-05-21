/**
 * Tests for the sandbox extension's mode switching and execution behavior.
 *
 * Loads the real extension factory against a fake pi API to verify:
 * - Mode transitions via session_start and /sandbox command
 * - That unsupported platforms gracefully fall back to yolo
 * - That sandbox init failure on a supported platform crashes (never silently runs unsandboxed)
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
			return {
				cwd: "/tmp",
				ui: {
					setStatus: vi.fn((key: string, text: string) => {
						statuses.push({ key, text });
					}),
					notify: vi.fn((message: string, level: string) => {
						notifications.push({ message, level });
					}),
					select: vi.fn(),
					input: vi.fn(),
				},
				...overrides,
			};
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
