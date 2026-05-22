import { describe, expect, it } from "vitest";
import {
	BYPASS_ALLOW,
	BYPASS_DENY,
	BYPASS_OPTIONS,
	CONFIRM_ALLOW,
	CONFIRM_DENY,
	CONFIRM_OPTIONS,
	modeStatusText,
	sandboxFooterBrief,
	sandboxFooterFull,
	shouldConfirmTool,
	shouldShowFullFooter,
} from "./config.js";

// ---------------------------------------------------------------------------
// DEFAULT_RUNTIME_CONFIG
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
		expect(matrix).toMatchInlineSnapshot(`
			{
			  "ask": {
			    "bash": true,
			    "edit": true,
			    "find": false,
			    "grep": false,
			    "ls": false,
			    "my_custom_tool": false,
			    "read": true,
			    "write": true,
			  },
			  "sandboxed": {
			    "bash": false,
			    "edit": false,
			    "find": false,
			    "grep": false,
			    "ls": false,
			    "my_custom_tool": false,
			    "read": false,
			    "write": false,
			  },
			  "yolo": {
			    "bash": false,
			    "edit": false,
			    "find": false,
			    "grep": false,
			    "ls": false,
			    "my_custom_tool": false,
			    "read": false,
			    "write": false,
			  },
			}
		`);
	});
});

// ---------------------------------------------------------------------------
// modeStatusText
// ---------------------------------------------------------------------------

describe("modeStatusText", () => {
	it("matches snapshot for all modes", () => {
		expect({
			ask: modeStatusText("ask"),
			sandboxed: modeStatusText("sandboxed"),
			yolo: modeStatusText("yolo"),
		}).toMatchInlineSnapshot(`
			{
			  "ask": "🔐 Ask mode: confirm every tool call, no sandbox (/sandbox)",
			  "sandboxed": "🎪 Sandboxed mode: write to ., /tmp (/sandbox)",
			  "yolo": "🚀 YOLO mode: no restrictions, no questions",
			}
		`);
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
		}).toMatchInlineSnapshot(`
			{
			  "allow": "✅ Allow — run outside sandbox",
			  "deny": "❌ Deny",
			  "options": [
			    "✅ Allow — run outside sandbox",
			    "❌ Deny",
			  ],
			}
		`);
	});

	it("CONFIRM_OPTIONS matches snapshot", () => {
		expect({
			options: [...CONFIRM_OPTIONS],
			allow: CONFIRM_ALLOW,
			deny: CONFIRM_DENY,
		}).toMatchInlineSnapshot(`
			{
			  "allow": "✅ Allow",
			  "deny": "❌ Deny",
			  "options": [
			    "✅ Allow",
			    "❌ Deny",
			  ],
			}
		`);
	});

	it("all options are strings (not [object Object])", () => {
		for (const opt of [...BYPASS_OPTIONS, ...CONFIRM_OPTIONS]) {
			expect(typeof opt).toBe("string");
			expect(opt).not.toContain("[object");
		}
	});
});

// ---------------------------------------------------------------------------
// sandboxFooter
// ---------------------------------------------------------------------------

describe("sandboxFooter", () => {
	it("matches snapshot", () => {
		expect(sandboxFooterBrief()).toMatchInlineSnapshot(
			`"-- SANDBOX: ENABLED --"`,
		);
	});
});

// ---------------------------------------------------------------------------
// sandboxInfo
// ---------------------------------------------------------------------------

describe("sandboxInfo", () => {
	it("matches snapshot", () => {
		expect(sandboxFooterFull()).toMatchInlineSnapshot(`
			"--- SANDBOX ---
			Network allowed: raw.githubusercontent.com, deepwiki.com, docs.rs, pkg.go.dev, npmjs.org, kagi.com, *.kagi.com, api.search.brave.com
			Network denied: (none)
			Filesystem deny read: ~/.ssh, ~/.aws, ~/.gnupg
			Filesystem allow write: ., /tmp
			Filesystem deny write: .env, .env.*, *.pem, *.key, **/node_modules/**, **/vendor/**, **/__pycache__/**, **/.venv/**, **/.git/**

			If a command fails due to sandbox restrictions, re-run with askOutsideSandbox: true.
			Do not ask the user first — just set the flag and re-run.
			--- END SANDBOX ---"
		`);
	});
});

// ---------------------------------------------------------------------------
// shouldShowFullFooter
// ---------------------------------------------------------------------------

describe("shouldShowFullFooter", () => {
	it("matches snapshot", () => {
		const cases: Record<string, boolean> = {};
		for (const n of [1, 2, 49, 50, 51, 100, 101]) {
			cases[n] = shouldShowFullFooter(n);
		}
		expect(cases).toMatchInlineSnapshot(`
			{
			  "1": true,
			  "100": true,
			  "101": false,
			  "2": false,
			  "49": false,
			  "50": true,
			  "51": false,
			}
		`);
	});
});
