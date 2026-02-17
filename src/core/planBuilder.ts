import type { CliFlags, Config, EnvDetection, FixStep } from "../types.js";
import { buildNodeSteps } from "../subsystems/node.js";
import { buildPythonSteps } from "../subsystems/python.js";
import { buildDockerSteps } from "../subsystems/docker.js";
import { buildCheckSteps } from "../subsystems/checks.js";

export function buildPortSteps(flags: CliFlags, config: Config): FixStep[] {
  if (!flags.killPorts) return [];
  const ports = flags.killPorts.length > 0 ? flags.killPorts : [...config.ports.default, ...config.ports.extra];
  if (ports.length === 0) return [];
  return [
    {
      id: "ports-cleanup",
      title: "Kill processes using configured ports",
      subsystem: "meta",
      rationale: "Port conflict cleanup before subsystem repair.",
      commands: ports.map((port) => `lsof -ti :${port} | xargs kill -9`),
      destructive: false,
      status: "planned",
    },
  ];
}

export function buildPlan(detection: EnvDetection, config: Config, flags: CliFlags): FixStep[] {
  const steps: FixStep[] = [];
  steps.push(...buildPortSteps(flags, config));

  if (flags.focus === "all" || flags.focus === "node") {
    steps.push(...buildNodeSteps(detection, config, flags));
  }
  if (flags.focus === "all" || flags.focus === "python") {
    steps.push(...buildPythonSteps(detection, config, flags));
  }
  if (flags.focus === "all" || flags.focus === "docker") {
    steps.push(...buildDockerSteps(detection, config, flags));
  }

  if (flags.focus === "all" || flags.focus === "node") {
    steps.push(...buildCheckSteps(detection, config, flags, "node"));
  }
  if (flags.focus === "all" || flags.focus === "python") {
    steps.push(...buildCheckSteps(detection, config, flags, "python"));
  }
  return steps;
}
