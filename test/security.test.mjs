import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

async function createFixture(files) {
    const dir = await mkdtemp(path.join(tmpdir(), "autofix-sec-"));
    for (const [name, content] of Object.entries(files)) {
        const fullPath = path.join(dir, name);
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content);
    }
    return dir;
}

describe("SEC-001: Shell injection prevention", () => {
    test("Env key sanitizer strips shell metacharacters from .env.example keys", async () => {
        const { buildEnvSteps } = await import("../dist/subsystems/environment.js");
        const cwd = await createFixture({
            ".env.example": 'SAFE_KEY=foo\n"; touch /tmp/pwned; echo "=bar\n',
            ".env": "SAFE_KEY=value\n",
        });
        const detection = {
            node: { detected: false, packageManager: "unknown", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: false, hasPyproject: false, hasRequirements: false, venvPath: ".venv", venvExists: false },
            docker: { detected: false },
            environment: { hasEnv: true, hasEnvExample: true },
            engines: {},
            issues: [],
        };
        const steps = await buildEnvSteps(cwd, detection, {}, {});
        if (steps.length > 0) {
            // Verify the command string does NOT contain the injection payload
            const cmd = steps[0].commands[0];
            assert.ok(!cmd.includes("touch /tmp/pwned"), "Injection payload should be sanitized out of command");
        }
        await rm(cwd, { recursive: true, force: true });
    });

    test("Cache directory with shell metacharacters is rejected", async () => {
        const { buildNodeSteps } = await import("../dist/subsystems/node.js");
        const detection = {
            node: { detected: true, packageManager: "npm", hasNodeModules: true, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: false, hasPyproject: false, hasRequirements: false, venvPath: ".venv", venvExists: false },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: false },
            engines: {},
            issues: [],
        };
        const config = {
            node: {
                package_manager: "auto",
                caches: { next: false, vite: false, directories: ["boom; touch /tmp/pwned"] },
                deep_cleanup: { remove_node_modules: false, remove_lockfile: false },
            },
        };
        const steps = buildNodeSteps(detection, config, {});
        const cacheStep = steps.find((s) => s.id.includes("cache"));
        assert.ok(cacheStep, "Cache step should exist");
        assert.equal(cacheStep.status, "proposed", "Unsafe cache dir should be proposed/skipped, not planned");
        assert.equal(cacheStep.commands.length, 0, "Unsafe cache dir should have no executable commands");
    });
});

describe("SEC-002: Undo path traversal prevention", () => {
    test("Path traversal is blocked in undo restore target", async () => {
        const { undoLatest } = await import("../dist/core/undo.js");
        const cwd = await createFixture({});
        // Create a fake report with a traversal snapshot path
        const snapshotDir = path.join(cwd, ".autofix", "snapshots", "test-run", "test-step");
        await mkdir(snapshotDir, { recursive: true });
        const maliciousSnap = path.join(snapshotDir, ".._.._tmp_autofix-traversal-target");
        await writeFile(maliciousSnap, "malicious content");

        const reportPath = path.join(cwd, "latest.json");
        await writeFile(reportPath, JSON.stringify({
            runId: "test-run",
            command: "run",
            timestamp: new Date().toISOString(),
            steps: [{
                id: "test-step",
                title: "test",
                subsystem: "node",
                phase: "node",
                rationale: "test",
                commands: [],
                destructive: false,
                irreversible: false,
                undoable: true,
                snapshotPaths: [maliciousSnap],
                status: "success",
            }],
            summary: { total: 1, success: 1, failed: 0, proposed: 0, skipped: 0 },
        }));

        const result = await undoLatest(reportPath, cwd);
        const entry = result.entries[0];
        assert.ok(entry.failed.length > 0, "Traversal path should end up in failed list");
        assert.ok(entry.failed[0].includes("blocked"), "Failed entry should mention blocked traversal");
        await rm(cwd, { recursive: true, force: true });
    });
});

describe("REL-001: Unknown command rejection", () => {
    test("Typo command exits with error instead of running", () => {
        const result = spawnSync("node", ["dist/cli.js", "repot", "--no-color"], { encoding: "utf8" });
        assert.notEqual(result.status, 0, "Unknown command should exit with non-zero code");
        assert.ok(result.stderr.includes("Unknown command"), "Should print unknown command error");
    });
});

describe("REL-005: Docker warning gated on detection", () => {
    test("Plan in non-Docker project does not show Docker warning", () => {
        const result = spawnSync("node", ["dist/cli.js", "plan", "--no-color"], { encoding: "utf8" });
        // If no docker-compose.yml in cwd, should NOT see docker warning
        assert.ok(!result.stdout.includes("docker compose up"), "Docker warning should not appear in non-Docker projects");
    });
});

describe("Utils: shellQuote and isSafePath", () => {
    test("shellQuote wraps in single quotes and escapes embedded quotes", async () => {
        const { shellQuote } = await import("../dist/utils/process.js");
        assert.equal(shellQuote("hello"), "'hello'");
        assert.equal(shellQuote("it's"), "'it'\\''s'");
        assert.equal(shellQuote("/path/with spaces"), "'/path/with spaces'");
    });

    test("isSafePath rejects dangerous patterns", async () => {
        const { isSafePath } = await import("../dist/utils/process.js");
        assert.equal(isSafePath(".cache"), true);
        assert.equal(isSafePath(".turbo"), true);
        assert.equal(isSafePath("node_modules/.vite"), true);
        assert.equal(isSafePath("boom; rm -rf /"), false);
        assert.equal(isSafePath("foo && bar"), false);
        assert.equal(isSafePath("$(whoami)"), false);
        assert.equal(isSafePath("../../../etc/passwd"), false);
    });
});

describe("SEC-001: Package manager injection prevention", () => {
    test("Malicious package_manager from config falls back to npm", async () => {
        const { buildNodeSteps } = await import("../dist/subsystems/node.js");
        const detection = {
            node: { detected: true, packageManager: "npm", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: false, hasPyproject: false, hasRequirements: false, venvPath: ".venv", venvExists: false },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: false },
            engines: {},
            issues: [],
        };
        const config = {
            node: {
                package_manager: "evil; touch /tmp/pwned",
                caches: { next: false, vite: false, directories: [] },
                deep_cleanup: { remove_node_modules: false, remove_lockfile: false },
            },
        };
        const steps = buildNodeSteps(detection, config, {});
        const installStep = steps.find((s) => s.id === "node-install-deps");
        assert.ok(installStep, "Install step should exist");
        // Should use npm ci (safe default) not the malicious value
        assert.ok(installStep.commands[0].startsWith("npm"), "Should fall back to npm, not use injected value");
        assert.ok(!installStep.commands[0].includes("evil"), "Injected value should NOT appear in command");
    });
});

describe("REL-004: Config command injection prevention", () => {
    test("Unsafe Python tool commands from config are rejected (shell metachar)", async () => {
        const { buildCheckSteps } = await import("../dist/subsystems/checks.js");
        const detection = {
            node: { detected: false, packageManager: "unknown", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: true, hasPyproject: true, hasRequirements: false, venvPath: ".venv", venvExists: true },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: false },
            engines: {},
            issues: [],
        };
        const config = {
            python: {
                venv_path: ".venv",
                install: { prefer: "pip" },
                tools: {
                    format: ["ruff format .", "black . ; touch /tmp/pwned"],
                    lint: ["ruff check ."],
                    test: ["pytest -q"],
                },
            },
            checks: { default: ["format", "lint", "test"] },
        };
        const flags = { checks: ["format", "lint", "test"] };
        const steps = buildCheckSteps(detection, config, flags);

        const safeStep = steps.find((s) => s.title.includes("ruff format"));
        assert.ok(safeStep, "Safe format command should produce a step");
        assert.equal(safeStep.status, "planned", "Safe command should be planned");

        const unsafeStep = steps.find((s) => s.title.includes("SKIPPED"));
        assert.ok(unsafeStep, "Unsafe command should produce a SKIPPED step");
        assert.equal(unsafeStep.status, "proposed", "Unsafe command should be proposed/skipped");
        assert.equal(unsafeStep.commands.length, 0, "Unsafe command should have no executable commands");
    });

    test("Bare arbitrary commands (no metachar) are rejected via binary allowlist", async () => {
        const { buildCheckSteps } = await import("../dist/subsystems/checks.js");
        const detection = {
            node: { detected: false, packageManager: "unknown", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: true, hasPyproject: true, hasRequirements: false, venvPath: ".venv", venvExists: true },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: false },
            engines: {},
            issues: [],
        };
        const config = {
            python: {
                venv_path: ".venv",
                install: { prefer: "pip" },
                tools: {
                    format: ["ruff format ."],
                    lint: ["touch /tmp/autofix-config-marker"],
                    test: ["pytest -q"],
                },
            },
            checks: { default: ["format", "lint", "test"] },
        };
        const flags = { checks: ["format", "lint", "test"] };
        const steps = buildCheckSteps(detection, config, flags);

        // "ruff format ." and "pytest -q" should be planned (known tools)
        const ruffStep = steps.find((s) => s.title.includes("ruff format"));
        assert.ok(ruffStep, "ruff should produce a step");
        assert.equal(ruffStep.status, "planned", "Known tool ruff should be planned");

        const pytestStep = steps.find((s) => s.title.includes("pytest"));
        assert.ok(pytestStep, "pytest should produce a step");
        assert.equal(pytestStep.status, "planned", "Known tool pytest should be planned");

        // "touch /tmp/..." should be REJECTED — touch is NOT a known dev tool
        const touchStep = steps.find((s) => s.title.includes("touch") || s.title.includes("SKIPPED"));
        assert.ok(touchStep, "touch command should produce a rejected step");
        assert.equal(touchStep.status, "proposed", "Unrecognized binary 'touch' should be proposed/skipped");
        assert.equal(touchStep.commands.length, 0, "Rejected command should have no executable commands");
    });

    test("Config-level sanitization strips malicious entries at load time", async () => {
        const cwd = await createFixture({
            ".autofix.yml": [
                "version: 1",
                "python:",
                "  tools:",
                "    format:",
                '      - "ruff format ."',
                '      - "black . && rm -rf /"',
                "    lint:",
                '      - "ruff check ."',
                '      - "touch /tmp/autofix-config-marker"',
                "    test:",
                '      - "pytest -q"',
                "node:",
                "  caches:",
                "    directories:",
                '      - ".turbo"',
                '      - "boom; touch /tmp/pwned"',
            ].join("\n"),
            ".git": "",
        });
        const { loadConfig } = await import("../dist/config/loadConfig.js");
        const { config } = await loadConfig(cwd);

        // Safe entries should survive
        assert.ok(config.python.tools.format.includes("ruff format ."), "Safe format command should survive");
        assert.ok(config.python.tools.lint.includes("ruff check ."), "Safe lint command should survive");
        assert.ok(config.python.tools.test.includes("pytest -q"), "Safe test command should survive");
        assert.ok(config.node.caches.directories.includes(".turbo"), "Safe cache dir should survive");

        // Malicious entries should be stripped
        assert.ok(!config.python.tools.format.some((c) => c.includes("rm -rf")), "Shell metachar cmd should be stripped");
        assert.ok(!config.python.tools.lint.some((c) => c.includes("touch")), "Bare 'touch' command should be stripped by binary allowlist");
        assert.ok(!config.node.caches.directories.some((d) => d.includes(";")), "Malicious cache dir should be stripped");

        await rm(cwd, { recursive: true, force: true });
    });
});
