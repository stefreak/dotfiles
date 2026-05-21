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
	sandboxFooter,
	sandboxInfo,
	type SandboxConfig,
	shouldConfirmTool,
} from "./config.js";

// ---------------------------------------------------------------------------
// DEFAULT_CONFIG
// ---------------------------------------------------------------------------

describe("DEFAULT_CONFIG", () => {
	it("matches snapshot", () => {
		expect(DEFAULT_CONFIG).toMatchInlineSnapshot(`
			{
			  "enabled": true,
			  "filesystem": {
			    "allowWrite": [
			      ".",
			      "/tmp",
			    ],
			    "denyRead": [
			      "~/.ssh",
			      "~/.aws",
			      "~/.gnupg",
			    ],
			    "denyWrite": [
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
			  "mode": "sandboxed",
			  "network": {
			    "allowedDomains": [
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
			    "deniedDomains": [],
			  },
			}
		`);
	});
});

// ---------------------------------------------------------------------------
// deepMerge
// ---------------------------------------------------------------------------

describe("deepMerge", () => {
	it("returns base when overrides are empty", () => {
		expect(deepMerge(DEFAULT_CONFIG, {})).toMatchInlineSnapshot(`
			{
			  "enabled": true,
			  "filesystem": {
			    "allowWrite": [
			      ".",
			      "/tmp",
			    ],
			    "denyRead": [
			      "~/.ssh",
			      "~/.aws",
			      "~/.gnupg",
			    ],
			    "denyWrite": [
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
			  "mode": "sandboxed",
			  "network": {
			    "allowedDomains": [
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
			    "deniedDomains": [],
			  },
			}
		`);
	});

	it("overrides enabled", () => {
		expect(deepMerge(DEFAULT_CONFIG, { enabled: false })).toMatchInlineSnapshot(`
			{
			  "enabled": false,
			  "filesystem": {
			    "allowWrite": [
			      ".",
			      "/tmp",
			    ],
			    "denyRead": [
			      "~/.ssh",
			      "~/.aws",
			      "~/.gnupg",
			    ],
			    "denyWrite": [
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
			  "mode": "sandboxed",
			  "network": {
			    "allowedDomains": [
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
			    "deniedDomains": [],
			  },
			}
		`);
	});

	it("overrides mode", () => {
		expect(deepMerge(DEFAULT_CONFIG, { mode: "ask" })).toMatchInlineSnapshot(`
			{
			  "enabled": true,
			  "filesystem": {
			    "allowWrite": [
			      ".",
			      "/tmp",
			    ],
			    "denyRead": [
			      "~/.ssh",
			      "~/.aws",
			      "~/.gnupg",
			    ],
			    "denyWrite": [
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
			  "mode": "ask",
			  "network": {
			    "allowedDomains": [
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
			    "deniedDomains": [],
			  },
			}
		`);
	});

	it("merges network (shallow)", () => {
		expect(
			deepMerge(DEFAULT_CONFIG, {
				network: {
					allowedDomains: ["custom.com"],
					deniedDomains: ["evil.com"],
				},
			}),
		).toMatchInlineSnapshot(`
			{
			  "enabled": true,
			  "filesystem": {
			    "allowWrite": [
			      ".",
			      "/tmp",
			    ],
			    "denyRead": [
			      "~/.ssh",
			      "~/.aws",
			      "~/.gnupg",
			    ],
			    "denyWrite": [
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
			  "mode": "sandboxed",
			  "network": {
			    "allowedDomains": [
			      "custom.com",
			    ],
			    "deniedDomains": [
			      "evil.com",
			    ],
			  },
			}
		`);
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
		).toMatchInlineSnapshot(`
			{
			  "enabled": true,
			  "filesystem": {
			    "allowWrite": [
			      "/tmp",
			    ],
			    "denyRead": [
			      "/secret",
			    ],
			    "denyWrite": [
			      "*.key",
			    ],
			  },
			  "mode": "sandboxed",
			  "network": {
			    "allowedDomains": [
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
			    "deniedDomains": [],
			  },
			}
		`);
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
		).toMatchInlineSnapshot(`
			{
			  "filesystem": {
			    "allowWrite": [],
			    "denyRead": [],
			    "denyWrite": [],
			  },
			  "network": {
			    "allowedDomains": [
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
			    "deniedDomains": [],
			  },
			}
		`);
	});

	it("returns config values for sandboxed mode", () => {
		expect(
			getSandboxRuntimeConfigForMode("sandboxed", DEFAULT_CONFIG),
		).toMatchInlineSnapshot(`
			{
			  "filesystem": {
			    "allowWrite": [
			      ".",
			      "/tmp",
			    ],
			    "denyRead": [
			      "~/.ssh",
			      "~/.aws",
			      "~/.gnupg",
			    ],
			    "denyWrite": [
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
			  "network": {
			    "allowedDomains": [
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
			    "deniedDomains": [],
			  },
			}
		`);
	});

	it("preserves ignoreViolations from config", () => {
		const config: SandboxConfig = {
			...DEFAULT_CONFIG,
			ignoreViolations: { bash: ["~/.ssh"] },
		};
		expect(
			getSandboxRuntimeConfigForMode("sandboxed", config),
		).toMatchInlineSnapshot(`
			{
			  "filesystem": {
			    "allowWrite": [
			      ".",
			      "/tmp",
			    ],
			    "denyRead": [
			      "~/.ssh",
			      "~/.aws",
			      "~/.gnupg",
			    ],
			    "denyWrite": [
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
			  "ignoreViolations": {
			    "bash": [
			      "~/.ssh",
			    ],
			  },
			  "network": {
			    "allowedDomains": [
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
			    "deniedDomains": [],
			  },
			}
		`);
	});

	it("preserves enableWeakerNestedSandbox from config", () => {
		const config: SandboxConfig = {
			...DEFAULT_CONFIG,
			enableWeakerNestedSandbox: true,
		};
		expect(
			getSandboxRuntimeConfigForMode("sandboxed", config),
		).toMatchInlineSnapshot(`
			{
			  "enableWeakerNestedSandbox": true,
			  "filesystem": {
			    "allowWrite": [
			      ".",
			      "/tmp",
			    ],
			    "denyRead": [
			      "~/.ssh",
			      "~/.aws",
			      "~/.gnupg",
			    ],
			    "denyWrite": [
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
			  "network": {
			    "allowedDomains": [
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
			    "deniedDomains": [],
			  },
			}
		`);
	});

	it("ask mode locks down filesystem but uses config network", () => {
		const config: SandboxConfig = {
			...DEFAULT_CONFIG,
			network: { allowedDomains: ["everything.com"], deniedDomains: [] },
			filesystem: { denyRead: [], allowWrite: ["/"], denyWrite: [] },
		};
		expect(getSandboxRuntimeConfigForMode("ask", config)).toMatchInlineSnapshot(`
			{
			  "filesystem": {
			    "allowWrite": [],
			    "denyRead": [],
			    "denyWrite": [],
			  },
			  "network": {
			    "allowedDomains": [
			      "everything.com",
			    ],
			    "deniedDomains": [],
			  },
			}
		`);
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
		expect(matrix).toMatchInlineSnapshot(`
			{
			  "ask": {
			    "bash": false,
			    "edit": true,
			    "find": false,
			    "grep": false,
			    "ls": false,
			    "my_custom_tool": false,
			    "read": false,
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
			ask: modeStatusText("ask", DEFAULT_CONFIG),
			sandboxed: modeStatusText("sandboxed", DEFAULT_CONFIG),
			yolo: modeStatusText("yolo", DEFAULT_CONFIG),
		}).toMatchInlineSnapshot(`
			{
			  "ask": "🔐 Ask mode: confirm writes, read-only sandbox (/sandbox)",
			  "sandboxed": "🎪 Sandboxed mode: play within ., /tmp (/sandbox)",
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
// formatEditDiff
// ---------------------------------------------------------------------------

describe("formatEditDiff", () => {
	it("shows removal", () => {
		expect(
			formatEditDiff({
				edits: [{ oldText: "foo", newText: "" }],
			}),
		).toMatchInlineSnapshot(`
			"- foo
			"
		`);
	});

	it("shows addition", () => {
		expect(
			formatEditDiff({
				edits: [{ oldText: "", newText: "bar" }],
			}),
		).toMatchInlineSnapshot(`
			"+ bar
			"
		`);
	});

	it("shows change", () => {
		expect(
			formatEditDiff({
				edits: [{ oldText: "old", newText: "new" }],
			}),
		).toMatchInlineSnapshot(`
			"- old
			+ new
			"
		`);
	});

	it("shows unchanged lines with context", () => {
		expect(
			formatEditDiff({
				edits: [{ oldText: "keep\nchange", newText: "keep\nchanged" }],
			}),
		).toMatchInlineSnapshot(`
			"  keep
			- change
			+ changed
			"
		`);
	});

	it("truncates after 10 lines with summary", () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
		expect(
			formatEditDiff({
				edits: [{ oldText: lines.join("\n"), newText: "" }],
			}),
		).toMatchInlineSnapshot(`
			"- line 0
			- line 1
			- line 2
			- line 3
			- line 4
			- line 5
			- line 6
			- line 7
			- line 8
			- line 9
			... (10 more lines)
			"
		`);
	});

	it("handles multiple edits separated by blank line", () => {
		expect(
			formatEditDiff({
				edits: [
					{ oldText: "a", newText: "b" },
					{ oldText: "c", newText: "d" },
				],
			}),
		).toMatchInlineSnapshot(`
			"- a
			+ b

			- c
			+ d
			"
		`);
	});

	it("handles empty edits array", () => {
		expect(formatEditDiff({ edits: [] })).toMatchInlineSnapshot(`""`);
	});

	it("handles missing edits", () => {
		expect(formatEditDiff({})).toMatchInlineSnapshot(`""`);
	});
});

// ---------------------------------------------------------------------------
// sandboxFooter
// ---------------------------------------------------------------------------

describe("sandboxFooter", () => {
	it("matches snapshot", () => {
		expect(sandboxFooter()).toMatchInlineSnapshot(`"Filesystem and network restrictions are active. How to work in a sandbox: call get_sandbox_info"`);
	});
});

// ---------------------------------------------------------------------------
// sandboxInfo
// ---------------------------------------------------------------------------

describe("sandboxInfo", () => {
	it("matches snapshot", () => {
		expect(sandboxInfo(DEFAULT_CONFIG)).toMatchInlineSnapshot(`
			"--- SANDBOX INFO ---

			Network:
			  Allowed: npmjs.org, *.npmjs.org, registry.npmjs.org, registry.yarnpkg.com, pypi.org, *.pypi.org, github.com, *.github.com, api.github.com, raw.githubusercontent.com, kagi.com, *.kagi.com
			  Denied: (none)

			Filesystem:
			  Deny read: ~/.ssh, ~/.aws, ~/.gnupg
			  Allow write: ., /tmp
			  Deny write: .env, .env.*, *.pem, *.key, **/node_modules/**, **/vendor/**, **/__pycache__/**, **/.venv/**, **/.git/**

			If a command fails due to sandbox restrictions, re-run with askOutsideSandbox: true.
			This prompts the user for approval to run outside the sandbox.
			Do not ask the user first — just set the flag and re-run.
			--- END SANDBOX INFO ---"
		`);
	});
});
