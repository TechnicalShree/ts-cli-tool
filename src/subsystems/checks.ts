import type { CliFlags, Config, EnvDetection, FixStep } from "../types.js";

function nodeChecks(detection: EnvDetection, selected: Array<"lint" | "test" | "format">): FixStep[] {
  if (!detection.node.detected) return [];
  const scripts = detection.node.packageScripts;
  const steps: FixStep[] = [];
  if (selected.includes("lint") && scripts.includes("lint")) {
    steps.push({
      id: "check-node-lint",
      title: "Run Node lint check",
      subsystem: "checks",
      rationale: "Configured lint check for JS/TS project.",
      commands: ["npm run lint"],
      destructive: false,
      status: "planned",
    });
  }
  if (selected.includes("format") && scripts.includes("format")) {
    steps.push({
      id: "check-node-format",
      title: "Run Node format check",
      subsystem: "checks",
      rationale: "Configured formatting check for JS/TS project.",
      commands: ["npm run format"],
      destructive: false,
      status: "planned",
    });
  }
  if (selected.includes("test") && scripts.includes("test")) {
    steps.push({
      id: "check-node-test",
      title: "Run Node tests",
      subsystem: "checks",
      rationale: "Configured test script for JS/TS project.",
      commands: ["npm test"],
      destructive: false,
      status: "planned",
    });
  }
  return steps;
}

function pythonChecks(
  detection: EnvDetection,
  config: Config,
  selected: Array<"lint" | "test" | "format">,
): FixStep[] {
  if (!detection.python.detected) return [];
  const steps: FixStep[] = [];
  if (selected.includes("format")) {
    for (const cmd of config.python.tools.format) {
      steps.push({
        id: `check-python-format-${cmd.replace(/[^a-z0-9]/gi, "-")}`,
        title: `Run Python format: ${cmd}`,
        subsystem: "checks",
        rationale: "Configured Python formatting check.",
        commands: [cmd],
        destructive: false,
        status: "planned",
      });
    }
  }
  if (selected.includes("lint")) {
    for (const cmd of config.python.tools.lint) {
      steps.push({
        id: `check-python-lint-${cmd.replace(/[^a-z0-9]/gi, "-")}`,
        title: `Run Python lint: ${cmd}`,
        subsystem: "checks",
        rationale: "Configured Python lint check.",
        commands: [cmd],
        destructive: false,
        status: "planned",
      });
    }
  }
  if (selected.includes("test")) {
    for (const cmd of config.python.tools.test) {
      steps.push({
        id: `check-python-test-${cmd.replace(/[^a-z0-9]/gi, "-")}`,
        title: `Run Python tests: ${cmd}`,
        subsystem: "checks",
        rationale: "Configured Python test check.",
        commands: [cmd],
        destructive: false,
        status: "planned",
      });
    }
  }
  return steps;
}

export function buildCheckSteps(detection: EnvDetection, config: Config, flags: CliFlags): FixStep[] {
  const selected = flags.checks ?? config.checks.default;
  return [...nodeChecks(detection, selected), ...pythonChecks(detection, config, selected)];
}
