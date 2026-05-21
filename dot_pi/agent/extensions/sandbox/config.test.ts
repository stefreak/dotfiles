import { describe, expect, it } from "vitest";
import {
	BYPASS_ALLOW,
	BYPASS_DENY,
	BYPASS_OPTIONS,
	CONFIRM_ALLOW,
	CONFIRM_DENY,
	CONFIRM_OPTIONS,
	DEFAULT_CONFIG,
	deepMerge,
	formatEditDiff,
	getSandboxRuntimeConfigForMode,
	modeStatusText,
	type SandboxConfig,
	shouldConfirmTool,
} from "./config.js";

// ---------------------------------------------------------------------------
// DEFAULT_CONFIG
// ---------------------------------------------------------------------------

describe("DEFAULT_CONFIG", () => {
	it("matches snapshot", () => {
		expect(DEFAULT_CONFIG).toMatchSnapshot();
	});
});

// ---------------------------------------------------------------------------
// deepMerge
// ---------------------------------------------------------------------------

describe("deepMerge", () => {
	it("returns base when overrides are empty", () => {
		expect(deepMerge(DEFAULT_CONFIG, {})).toMatchSnapshot();
	});

	it("overrides enabled", () => {
		expect(deepMerge(DEFAULT_CONFIG, { enabled: false })).toMatchSnapshot();
	});

	it("overrides mode", () => {
		expect(deepMerge(DEFAULT_CONFIG, { mode: "ask" })).toMatchSnapshot();
	});

	it("merges network (shallow)", () => {
		expect(
			deepMerge(DEFAULT_CONFIG, {
				network: {
					allowedDomains: ["custom.com"],
					deniedDomains: ["evil.com"],
				},
			}),
		).toMatchSnapshot();
	});

	it("merges filesystem (shallow)", () => {
		expect(
			deepMerge(DEFAULT_CONFIG, {
				filesystem: {
					denyRead: ["/secret"],
					allowWrite: ["/tmp"],
					denyWrite: ["*.key"],
				},
			}),
		).toMatchSnapshot();
	});

	it("does not mutate base", () => {
		const base = { ...DEFAULT_CONFIG };
		deepMerge(base, { mode: "yolo" });
		expect(base.mode).toBe("sandboxed");
	});

	it("chains: global then project wins", () => {
		const merged = deepMerge(deepMerge(DEFAULT_CONFIG, { mode: "ask" }), {
			mode: "yolo",
		});
		expect(merged.mode).toBe("yolo");
	});
});

// ---------------------------------------------------------------------------
// getSandboxRuntimeConfigForMode
// ---------------------------------------------------------------------------

describe("getSandboxRuntimeConfigForMode", () => {
	it("returns null for yolo mode", () => {
		expect(getSandboxRuntimeConfigForMode("yolo", DEFAULT_CONFIG)).toBeNull();
	});

	it("returns locked-down filesystem for ask mode", () => {
		expect(
			getSandboxRuntimeConfigForMode("ask", DEFAULT_CONFIG),
		).toMatchSnapshot();
	});

	it("returns config values for sandboxed mode", () => {
		expect(
			getSandboxRuntimeConfigForMode("sandboxed", DEFAULT_CONFIG),
		).toMatchSnapshot();
	});

	it("preserves ignoreViolations from config", () => {
		const config: SandboxConfig = {
			...DEFAULT_CONFIG,
			ignoreViolations: { bash: ["~/.ssh"] },
		};
		expect(
			getSandboxRuntimeConfigForMode("sandboxed", config),
		).toMatchSnapshot();
	});

	it("preserves enableWeakerNestedSandbox from config", () => {
		const config: SandboxConfig = {
			...DEFAULT_CONFIG,
			enableWeakerNestedSandbox: true,
		};
		expect(
			getSandboxRuntimeConfigForMode("sandboxed", config),
		).toMatchSnapshot();
	});

	it("ask mode locks down filesystem but uses config network", () => {
		const config: SandboxConfig = {
			...DEFAULT_CONFIG,
			network: { allowedDomains: ["everything.com"], deniedDomains: [] },
			filesystem: { denyRead: [], allowWrite: ["/"], denyWrite: [] },
		};
		expect(getSandboxRuntimeConfigForMode("ask", config)).toMatchSnapshot();
	});
});

// ---------------------------------------------------------------------------
// shouldConfirmTool
// ---------------------------------------------------------------------------

describe("shouldConfirmTool", () => {
	const tools = [
		"write",
		"edit",
		"read",
		"bash",
		"grep",
		"find",
		"ls",
		"my_custom_tool",
	] as const;
	const modes = ["ask", "sandboxed", "yolo"] as const;

	it("matches snapshot", () => {
		const matrix: Record<string, Record<string, boolean>> = {};
		for (const mode of modes) {
			matrix[mode] = {};
			for (const tool of tools) {
				matrix[mode][tool] = shouldConfirmTool(mode, tool);
			}
		}
		expect(matrix).toMatchSnapshot();
	});
});

// ---------------------------------------------------------------------------
// modeStatusText
// ---------------------------------------------------------------------------

describe("modeStatusText", () => {
	it("matches snapshot for all modes", () => {
		expect({
			ask: modeStatusText("ask", DEFAULT_CONFIG),
			sandboxed: modeStatusText("sandboxed", DEFAULT_CONFIG),
			yolo: modeStatusText("yolo", DEFAULT_CONFIG),
		}).toMatchSnapshot();
	});
});

// ---------------------------------------------------------------------------
// select dialog options
// ---------------------------------------------------------------------------

describe("select dialog options", () => {
	it("BYPASS_OPTIONS matches snapshot", () => {
		expect({
			options: [...BYPASS_OPTIONS],
			allow: BYPASS_ALLOW,
			deny: BYPASS_DENY,
		}).toMatchSnapshot();
	});

	it("CONFIRM_OPTIONS matches snapshot", () => {
		expect({
			options: [...CONFIRM_OPTIONS],
			allow: CONFIRM_ALLOW,
			deny: CONFIRM_DENY,
		}).toMatchSnapshot();
	});

	it("all options are strings (not [object Object])", () => {
		for (const opt of [...BYPASS_OPTIONS, ...CONFIRM_OPTIONS]) {
			expect(typeof opt).toBe("string");
			expect(opt).not.toContain("[object");
		}
	});
});

// ---------------------------------------------------------------------------
// formatEditDiff
// ---------------------------------------------------------------------------

describe("formatEditDiff", () => {
	it("shows removal", () => {
		expect(
			formatEditDiff({
				edits: [{ oldText: "foo", newText: "" }],
			}),
		).toMatchSnapshot();
	});

	it("shows addition", () => {
		expect(
			formatEditDiff({
				edits: [{ oldText: "", newText: "bar" }],
			}),
		).toMatchSnapshot();
	});

	it("shows change", () => {
		expect(
			formatEditDiff({
				edits: [{ oldText: "old", newText: "new" }],
			}),
		).toMatchSnapshot();
	});

	it("shows unchanged lines with context", () => {
		expect(
			formatEditDiff({
				edits: [{ oldText: "keep\nchange", newText: "keep\nchanged" }],
			}),
		).toMatchSnapshot();
	});

	it("truncates after 10 lines with summary", () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
		expect(
			formatEditDiff({
				edits: [{ oldText: lines.join("\n"), newText: "" }],
			}),
		).toMatchSnapshot();
	});

	it("handles multiple edits separated by blank line", () => {
		expect(
			formatEditDiff({
				edits: [
					{ oldText: "a", newText: "b" },
					{ oldText: "c", newText: "d" },
				],
			}),
		).toMatchSnapshot();
	});

	it("handles empty edits array", () => {
		expect(formatEditDiff({ edits: [] })).toMatchSnapshot();
	});

	it("handles missing edits", () => {
		expect(formatEditDiff({})).toMatchSnapshot();
	});
});
