import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	deepMerge,
	getSandboxRuntimeConfigForMode,
	shouldConfirmTool,
	modeStatusText,
	formatEditDiff,
	DEFAULT_CONFIG,
	BYPASS_OPTIONS,
	BYPASS_ALLOW,
	BYPASS_DENY,
	CONFIRM_OPTIONS,
	CONFIRM_ALLOW,
	CONFIRM_DENY,
	type SandboxConfig,
	type SandboxMode,
} from "./config.js";

describe("deepMerge", () => {
	it("returns base when overrides are empty", () => {
		const result = deepMerge(DEFAULT_CONFIG, {});
		assert.equal(result.enabled, true);
		assert.equal(result.mode, "sandboxed");
		assert.deepEqual(result.network, DEFAULT_CONFIG.network);
		assert.deepEqual(result.filesystem, DEFAULT_CONFIG.filesystem);
	});

	it("overrides enabled", () => {
		const result = deepMerge(DEFAULT_CONFIG, { enabled: false });
		assert.equal(result.enabled, false);
	});

	it("overrides mode", () => {
		const result = deepMerge(DEFAULT_CONFIG, { mode: "ask" });
		assert.equal(result.mode, "ask");
	});

	it("merges network (shallow)", () => {
		const result = deepMerge(DEFAULT_CONFIG, {
			network: { allowedDomains: ["custom.com"], deniedDomains: ["evil.com"] },
		});
		assert.deepEqual(result.network?.allowedDomains, ["custom.com"]);
		assert.deepEqual(result.network?.deniedDomains, ["evil.com"]);
	});

	it("merges filesystem (shallow)", () => {
		const result = deepMerge(DEFAULT_CONFIG, {
			filesystem: { denyRead: ["/secret"], allowWrite: ["/tmp"], denyWrite: ["*.key"] },
		});
		assert.deepEqual(result.filesystem?.denyRead, ["/secret"]);
		assert.deepEqual(result.filesystem?.allowWrite, ["/tmp"]);
		assert.deepEqual(result.filesystem?.denyWrite, ["*.key"]);
	});

	it("does not mutate base", () => {
		const base = { ...DEFAULT_CONFIG };
		deepMerge(base, { mode: "yolo" });
		assert.equal(base.mode, "sandboxed");
	});

	it("chains: global then project wins", () => {
		const merged = deepMerge(
			deepMerge(DEFAULT_CONFIG, { mode: "ask" }),
			{ mode: "yolo" },
		);
		assert.equal(merged.mode, "yolo");
	});
});

describe("getSandboxRuntimeConfigForMode", () => {
	it("returns null for yolo mode", () => {
		const result = getSandboxRuntimeConfigForMode("yolo", DEFAULT_CONFIG);
		assert.equal(result, null);
	});

	it("returns locked-down filesystem for ask mode", () => {
		const result = getSandboxRuntimeConfigForMode("ask", DEFAULT_CONFIG);
		assert.notEqual(result, null);
		// Ask mode keeps network from config
		assert.equal(result!.network?.allowedDomains?.length, DEFAULT_CONFIG.network!.allowedDomains!.length);
		// But locks down filesystem (read-only)
		assert.deepEqual(result!.filesystem?.denyRead, []);
		assert.deepEqual(result!.filesystem?.allowWrite, []);
		assert.deepEqual(result!.filesystem?.denyWrite, []);
	});

	it("returns config values for sandboxed mode", () => {
		const result = getSandboxRuntimeConfigForMode("sandboxed", DEFAULT_CONFIG);
		assert.notEqual(result, null);
		assert.equal(result!.network?.allowedDomains?.length, DEFAULT_CONFIG.network!.allowedDomains!.length);
		assert.equal(result!.filesystem?.allowWrite?.length, DEFAULT_CONFIG.filesystem!.allowWrite!.length);
	});

	it("preserves ignoreViolations from config", () => {
		const config: SandboxConfig = {
			...DEFAULT_CONFIG,
			ignoreViolations: { bash: ["~/.ssh"] },
		};
		const result = getSandboxRuntimeConfigForMode("sandboxed", config);
		assert.deepEqual((result as any)?.ignoreViolations, { bash: ["~/.ssh"] });
	});

	it("preserves enableWeakerNestedSandbox from config", () => {
		const config: SandboxConfig = {
			...DEFAULT_CONFIG,
			enableWeakerNestedSandbox: true,
		};
		const result = getSandboxRuntimeConfigForMode("sandboxed", config);
		assert.equal((result as any)?.enableWeakerNestedSandbox, true);
	});

	it("ask mode locks down filesystem but uses config network", () => {
		const config: SandboxConfig = {
			...DEFAULT_CONFIG,
			network: { allowedDomains: ["everything.com"], deniedDomains: [] },
			filesystem: { denyRead: [], allowWrite: ["/"], denyWrite: [] },
		};
		const result = getSandboxRuntimeConfigForMode("ask", config);
		// Ask uses config network
		assert.deepEqual(result!.network?.allowedDomains, ["everything.com"]);
		// But locks down filesystem regardless of config
		assert.deepEqual(result!.filesystem?.allowWrite, []);
	});
});

describe("shouldConfirmTool", () => {
	it("confirms write in ask mode", () => {
		assert.equal(shouldConfirmTool("ask", "write"), true);
	});

	it("confirms edit in ask mode", () => {
		assert.equal(shouldConfirmTool("ask", "edit"), true);
	});

	it("does not confirm read/bash in ask mode", () => {
		assert.equal(shouldConfirmTool("ask", "read"), false);
		assert.equal(shouldConfirmTool("ask", "bash"), false);
	});

	it("does not confirm tools in sandboxed mode", () => {
		assert.equal(shouldConfirmTool("sandboxed", "write"), false);
		assert.equal(shouldConfirmTool("sandboxed", "edit"), false);
		assert.equal(shouldConfirmTool("sandboxed", "bash"), false);
	});

	it("does not confirm tools in yolo mode", () => {
		assert.equal(shouldConfirmTool("yolo", "write"), false);
		assert.equal(shouldConfirmTool("yolo", "edit"), false);
	});

	it("does not confirm unknown tools in ask mode", () => {
		assert.equal(shouldConfirmTool("ask", "my_custom_tool"), false);
	});
});

describe("DEFAULT_CONFIG", () => {
	describe("network allowedDomains", () => {
		const EXPECTED = [
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
		];

		for (const domain of EXPECTED) {
			it(`includes ${domain}`, () => {
				assert.ok(
					DEFAULT_CONFIG.network?.allowedDomains?.includes(domain),
					`${domain} should be in network.allowedDomains`,
				);
			});
		}
	});

	describe("filesystem denyRead", () => {
		for (const path of ["~/.ssh", "~/.aws", "~/.gnupg"]) {
			it(`includes ${path}`, () => {
				assert.ok(
					DEFAULT_CONFIG.filesystem?.denyRead?.includes(path),
					`${path} should be in filesystem.denyRead`,
				);
			});
		}
	});

	describe("filesystem denyWrite", () => {
		const EXPECTED = [
			".env",
			".env.*",
			"*.pem",
			"*.key",
			"**/.git/**",
			"**/node_modules/**",
			"**/vendor/**",
			"**/__pycache__/**",
			"**/.venv/**",
		];

		for (const pattern of EXPECTED) {
			it(`includes ${pattern}`, () => {
				assert.ok(
					DEFAULT_CONFIG.filesystem?.denyWrite?.includes(pattern),
					`${pattern} should be in filesystem.denyWrite`,
				);
			});
		}
	});

	describe("filesystem allowWrite", () => {
		const EXPECTED = [".", "/tmp"];

		for (const path of EXPECTED) {
			it(`includes ${path}`, () => {
				assert.ok(
					DEFAULT_CONFIG.filesystem?.allowWrite?.includes(path),
					`${path} should be in filesystem.allowWrite`,
				);
			});
		}
	});

	it("has mode set", () => {
		assert.equal(DEFAULT_CONFIG.mode, "sandboxed");
	});

	it("is enabled by default", () => {
		assert.equal(DEFAULT_CONFIG.enabled, true);
	});
});

describe("modeStatusText", () => {
	it("ask mode shows confirm label", () => {
		const text = modeStatusText("ask", DEFAULT_CONFIG);
		assert.match(text, /Ask mode/i);
		assert.match(text, /confirm/i);
	});

	it("sandboxed mode shows label", () => {
		const text = modeStatusText("sandboxed", DEFAULT_CONFIG);
		assert.match(text, /Sandboxed/i);
		assert.match(text, /\/sandbox/);
	});

	it("yolo mode shows no restrictions", () => {
		const text = modeStatusText("yolo", DEFAULT_CONFIG);
		assert.match(text, /YOLO/i);
		assert.match(text, /no restrictions.*no questions/i);
	});
});

describe("select dialog options", () => {
	describe("BYPASS_OPTIONS", () => {
		it("all items are strings", () => {
			for (const opt of BYPASS_OPTIONS) {
				assert.equal(typeof opt, "string", `Expected string, got ${typeof opt}: ${opt}`);
			}
		});

		it("no item renders as [object Object]", () => {
			for (const opt of BYPASS_OPTIONS) {
				assert(!opt.includes("[object"), `Option renders as: ${opt}`);
			}
		});

		it("has exactly 2 options", () => {
			assert.equal(BYPASS_OPTIONS.length, 2);
		});

		it("first option is Allow", () => {
			assert.equal(BYPASS_ALLOW, BYPASS_OPTIONS[0]);
			assert.match(BYPASS_ALLOW, /Allow/);
		});

		it("second option is Deny", () => {
			assert.equal(BYPASS_DENY, BYPASS_OPTIONS[1]);
			assert.match(BYPASS_DENY, /Deny/);
		});
	});

	describe("CONFIRM_OPTIONS", () => {
		it("all items are strings", () => {
			for (const opt of CONFIRM_OPTIONS) {
				assert.equal(typeof opt, "string", `Expected string, got ${typeof opt}: ${opt}`);
			}
		});

		it("no item renders as [object Object]", () => {
			for (const opt of CONFIRM_OPTIONS) {
				assert(!opt.includes("[object"), `Option renders as: ${opt}`);
			}
		});

		it("has exactly 2 options", () => {
			assert.equal(CONFIRM_OPTIONS.length, 2);
		});

		it("first option is Allow", () => {
			assert.equal(CONFIRM_ALLOW, CONFIRM_OPTIONS[0]);
			assert.match(CONFIRM_ALLOW, /Allow/);
		});

		it("second option is Deny", () => {
			assert.equal(CONFIRM_DENY, CONFIRM_OPTIONS[1]);
			assert.match(CONFIRM_DENY, /Deny/);
		});
	});
});

describe("formatEditDiff", () => {
	it("shows removal with - prefix", () => {
		const result = formatEditDiff({
			edits: [{ oldText: "foo", newText: "" }],
		});
		assert.match(result, /^- foo$/m);
		assert.doesNotMatch(result, /\+ /);
	});

	it("shows addition with + prefix", () => {
		const result = formatEditDiff({
			edits: [{ oldText: "", newText: "bar" }],
		});
		assert.match(result, /^\+ bar$/m);
		assert.doesNotMatch(result, /- /);
	});

	it("shows change with both - and +", () => {
		const result = formatEditDiff({
			edits: [{ oldText: "old", newText: "new" }],
		});
		assert.match(result, /^- old$/m);
		assert.match(result, /^\+ new$/m);
	});

	it("shows unchanged lines with space prefix", () => {
		const result = formatEditDiff({
			edits: [{ oldText: "keep\nchange", newText: "keep\nchanged" }],
		});
		assert.match(result, /^  keep$/m);
		assert.match(result, /^- change$/m);
		assert.match(result, /^\+ changed$/m);
	});

	it("truncates after 10 lines with summary", () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`);
		const result = formatEditDiff({
			edits: [{ oldText: lines.join("\n"), newText: "" }],
		});
		assert.match(result, /\.\.\. \(10 more lines\)/);
	});

	it("handles multiple edits separated by blank line", () => {
		const result = formatEditDiff({
			edits: [
				{ oldText: "a", newText: "b" },
				{ oldText: "c", newText: "d" },
			],
		});
		const blocks = result.split("\n\n");
		assert.equal(blocks.length, 2);
		assert.match(blocks[0], /^- a$/m);
		assert.match(blocks[0], /^\+ b$/m);
		assert.match(blocks[1], /^- c$/m);
		assert.match(blocks[1], /^\+ d$/m);
	});

	it("handles empty edits array", () => {
		const result = formatEditDiff({ edits: [] });
		assert.equal(result, "");
	});

	it("handles missing edits", () => {
		const result = formatEditDiff({});
		assert.equal(result, "");
	});
});
