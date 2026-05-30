import { describe, expect, it } from "vitest";
import {
	BYPASS_ALLOW,
	BYPASS_DENY,
	BYPASS_OPTIONS,
	CONFIRM_ALLOW,
	CONFIRM_DENY,
	CONFIRM_OPTIONS,
	isReadRestricted,
	isWriteRestricted,
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
	const tools = ["write", "edit", "read", "bash"] as const;
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
			    "read": true,
			    "write": true,
			  },
			  "sandboxed": {
			    "bash": false,
			    "edit": false,
			    "read": false,
			    "write": false,
			  },
			  "yolo": {
			    "bash": false,
			    "edit": false,
			    "read": false,
			    "write": false,
			  },
			}
		`);
	});
});

// ---------------------------------------------------------------------------
// Restrictions
// ---------------------------------------------------------------------------

describe("isReadRestricted", () => {
	const home = "/home/user";

	it("should allow regular files", () => {
		expect(isReadRestricted("/tmp/foo", home)).toBe(false);
		expect(isReadRestricted("/workspace/project/src/index.ts", home)).toBe(
			false,
		);
	});

	it("should deny restricted home dirs", () => {
		expect(isReadRestricted("/home/user/.ssh/id_rsa", home)).toBe(true);
		expect(isReadRestricted("/home/user/.ssh", home)).toBe(true);
		expect(isReadRestricted("/home/user/.aws/config", home)).toBe(true);
	});

	it("should handle hidden files and complex paths", () => {
		expect(isReadRestricted("/home/user/.ssh/../.ssh/id_rsa", home)).toBe(true);
		expect(isReadRestricted("/home/user/.ssh/./id_rsa", home)).toBe(true);
	});
});

describe("isWriteRestricted", () => {
	const cwd = "/workspace/project";
	const home = "/home/user";

	it("should allow write to cwd", () => {
		expect(isWriteRestricted("/workspace/project/file.ts", cwd, home)).toBe(
			false,
		);
	});

	it("should allow write to /tmp", () => {
		expect(isWriteRestricted("/tmp/file.ts", cwd, home)).toBe(false);
	});

	it("should deny write outside allowed dirs", () => {
		expect(isWriteRestricted("/etc/passwd", cwd, home)).toBe(true);
	});

	it("should deny write to restricted files (basename match)", () => {
		expect(isWriteRestricted("/workspace/project/.env", cwd, home)).toBe(true);
		expect(isWriteRestricted("/workspace/project/sub/.env", cwd, home)).toBe(
			true,
		);
	});

	it("should deny write to restricted read areas", () => {
		expect(isWriteRestricted("/home/user/.ssh/config", cwd, home)).toBe(true);
	});

	it("should deny write to denied patterns in /tmp (fixes bypass)", () => {
		expect(isWriteRestricted("/tmp/my-project/.git/config", cwd, home)).toBe(
			true,
		);
		expect(isWriteRestricted("/tmp/.env", cwd, home)).toBe(true);
		expect(isWriteRestricted("/tmp/foo.pem", cwd, home)).toBe(true);
	});

	it("should handle path traversal attempts", () => {
		// Attempt to go from /tmp to /etc
		expect(isWriteRestricted("/tmp/../etc/passwd", cwd, home)).toBe(true);
		// Attempt to go from cwd to /etc
		expect(
			isWriteRestricted("/workspace/project/../../etc/passwd", cwd, home),
		).toBe(true);
	});

	it("should handle hidden files correctly (dot: true)", () => {
		expect(isWriteRestricted("/workspace/project/.git/config", cwd, home)).toBe(
			true,
		);
		expect(isWriteRestricted("/tmp/.git/HEAD", cwd, home)).toBe(true);
	});

	it("should allow regular files in nested /tmp dirs", () => {
		expect(isWriteRestricted("/tmp/my-app/logs/test.log", cwd, home)).toBe(
			false,
		);
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
			Network allowed: raw.githubusercontent.com, deepwiki.com, docs.rs, pkg.go.dev, npmjs.org, kagi.com, *.kagi.com, api.search.brave.com, *.youtube.com
			Network denied: (none)
			Filesystem deny read: ~/.ssh, ~/.aws, ~/.gnupg, ~/Library/Application Support, ~/Library/Keychains, ~/.local/share/keyrings, ~/.pki
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
