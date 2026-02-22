import type { CheckKind, CliFlags, Config, EnvDetection, FixStep } from "../types.js";

function nodeChecks(detection: EnvDetection, selected: CheckKind[]): FixStep[] {
  if (!detection.node.detected) return [];
  const scripts = detection.node.packageScripts;
  const steps: FixStep[] = [];
  if (selected.includes("format") && scripts.includes("format")) {
    steps.push({
      id: "check-node-format",
      title: "Run Node format check",
      subsystem: "checks",
      phase: "checks",
      checkKind: "format",
      rationale: "Configured formatting check for JS/TS project.",
      commands: ["npm run format"],
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "planned",
    });
  }
  if (selected.includes("lint") && scripts.includes("lint")) {
    steps.push({
      id: "check-node-lint",
      title: "Run Node lint check",
      subsystem: "checks",
      phase: "checks",
      checkKind: "lint",
      rationale: "Configured lint check for JS/TS project.",
      commands: ["npm run lint"],
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "planned",
    });
  }
  if (selected.includes("test") && scripts.includes("test")) {
    steps.push({
      id: "check-node-test",
      title: "Run Node tests",
      subsystem: "checks",
      phase: "checks",
      checkKind: "test",
      rationale: "Configured test script for JS/TS project.",
      commands: ["npm test"],
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "planned",
    });
  }
  return steps;
}

/**
 * REL-004: Known tool binary allowlist.
 * Only commands starting with a recognized dev tool will be auto-executed.
 * Unrecognized binaries (touch, rm, curl, wget, etc.) are rejected.
 */
const KNOWN_TOOL_BINARIES = new Set([
  // Python formatters
  "ruff", "black", "autopep8", "yapf", "isort", "pyink",
  // Python linters
  "flake8", "pylint", "pyflakes", "pydocstyle", "pycodestyle", "bandit", "vulture",
  // Python type checkers
  "mypy", "pyright", "pytype", "pyre",
  // Python test runners
  "pytest", "unittest", "nose2", "tox", "nox", "coverage",
  // Python package managers (used as runner)
  "pip", "uv", "poetry", "pipenv", "pdm",
  // Python misc
  "python", "python3", "pre-commit", "sphinx-build",
  // Node tools (in case used in python context)
  "npm", "npx", "pnpm", "yarn",
]);

/**
 * REL-004: Validate a config-sourced command string.
 * Two checks:
 * 1. Character allowlist — rejects shell metacharacters
 * 2. Binary allowlist — first token must be a known dev tool
 */
function isSafeCommand(cmd: string): { safe: boolean; reason: string } {
  if (!cmd || cmd.trim().length === 0) return { safe: false, reason: "Empty command" };

  // Check 1: Character-level safety (no shell metacharacters)
  if (!/^[a-zA-Z0-9._\-/@:=*\s]+$/.test(cmd)) {
    return { safe: false, reason: `contains shell metacharacters` };
  }

  // Check 2: First token must be a known tool binary
  const binary = cmd.trim().split(/\s+/)[0].replace(/^.*\//, ""); // strip leading path
  if (!KNOWN_TOOL_BINARIES.has(binary)) {
    return { safe: false, reason: `unrecognized tool '${binary}'` };
  }

  return { safe: true, reason: "" };
}

function pythonChecks(detection: EnvDetection, config: Config, selected: CheckKind[]): FixStep[] {
  if (!detection.python.detected) return [];
  const steps: FixStep[] = [];
  if (selected.includes("format")) {
    for (const cmd of config.python.tools.format) {
      const validation = isSafeCommand(cmd);
      if (!validation.safe) {
        steps.push({
          id: `check-python-format-${cmd.replace(/[^a-z0-9]/gi, "-")}`,
          title: `SKIPPED: Rejected format command: ${cmd}`,
          subsystem: "checks",
          phase: "checks",
          checkKind: "format",
          rationale: `Config command rejected: ${validation.reason}.`,
          commands: [],
          destructive: false,
          irreversible: false,
          undoable: false,
          status: "proposed",
          proposedReason: `Command '${cmd}' was rejected (${validation.reason}). Only known dev tools are auto-executed. Run manually if needed.`,
        });
        continue;
      }
      steps.push({
        id: `check-python-format-${cmd.replace(/[^a-z0-9]/gi, "-")}`,
        title: `Run Python format: ${cmd}`,
        subsystem: "checks",
        phase: "checks",
        checkKind: "format",
        rationale: "Configured Python formatting check.",
        commands: [cmd],
        destructive: false,
        irreversible: false,
        undoable: false,
        status: "planned",
      });
    }
  }
  if (selected.includes("lint")) {
    for (const cmd of config.python.tools.lint) {
      const validation = isSafeCommand(cmd);
      if (!validation.safe) {
        steps.push({
          id: `check-python-lint-${cmd.replace(/[^a-z0-9]/gi, "-")}`,
          title: `SKIPPED: Rejected lint command: ${cmd}`,
          subsystem: "checks",
          phase: "checks",
          checkKind: "lint",
          rationale: `Config command rejected: ${validation.reason}.`,
          commands: [],
          destructive: false,
          irreversible: false,
          undoable: false,
          status: "proposed",
          proposedReason: `Command '${cmd}' was rejected (${validation.reason}). Only known dev tools are auto-executed. Run manually if needed.`,
        });
        continue;
      }
      steps.push({
        id: `check-python-lint-${cmd.replace(/[^a-z0-9]/gi, "-")}`,
        title: `Run Python lint: ${cmd}`,
        subsystem: "checks",
        phase: "checks",
        checkKind: "lint",
        rationale: "Configured Python lint check.",
        commands: [cmd],
        destructive: false,
        irreversible: false,
        undoable: false,
        status: "planned",
      });
    }
  }
  if (selected.includes("test")) {
    for (const cmd of config.python.tools.test) {
      const validation = isSafeCommand(cmd);
      if (!validation.safe) {
        steps.push({
          id: `check-python-test-${cmd.replace(/[^a-z0-9]/gi, "-")}`,
          title: `SKIPPED: Rejected test command: ${cmd}`,
          subsystem: "checks",
          phase: "checks",
          checkKind: "test",
          rationale: `Config command rejected: ${validation.reason}.`,
          commands: [],
          destructive: false,
          irreversible: false,
          undoable: false,
          status: "proposed",
          proposedReason: `Command '${cmd}' was rejected (${validation.reason}). Only known dev tools are auto-executed. Run manually if needed.`,
        });
        continue;
      }
      steps.push({
        id: `check-python-test-${cmd.replace(/[^a-z0-9]/gi, "-")}`,
        title: `Run Python tests: ${cmd}`,
        subsystem: "checks",
        phase: "checks",
        checkKind: "test",
        rationale: "Configured Python test check.",
        commands: [cmd],
        destructive: false,
        irreversible: false,
        undoable: false,
        status: "planned",
      });
    }
  }
  return steps;
}

export function buildCheckSteps(detection: EnvDetection, config: Config, flags: CliFlags, focusSubsystem?: "node" | "python"): FixStep[] {
  const selected = flags.checks ?? config.checks.default;
  const steps: FixStep[] = [];
  if (!focusSubsystem || focusSubsystem === "node") steps.push(...nodeChecks(detection, selected));
  if (!focusSubsystem || focusSubsystem === "python") steps.push(...pythonChecks(detection, config, selected));
  return steps;
}
