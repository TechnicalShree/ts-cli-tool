import type { CliFlags, Config, EnvDetection, FixStep } from "../types.js";
import { buildNodeSteps } from "../subsystems/node.js";
import { buildPythonSteps } from "../subsystems/python.js";
import { buildDockerSteps } from "../subsystems/docker.js";
import { buildCheckSteps } from "../subsystems/checks.js";
import { buildEnvSteps } from "../subsystems/environment.js";
import { buildEngineSteps } from "../subsystems/engines.js";

export function buildPortSteps(flags: CliFlags, config: Config): FixStep[] {
  if (!flags.killPorts) return [];
  const ports = flags.killPorts.length > 0 ? flags.killPorts : [...config.ports.default, ...config.ports.extra];
  if (ports.length === 0) return [];
  return [
    {
      id: "ports-cleanup",
      title: "Kill processes using configured ports",
      subsystem: "meta",
      phase: "ports",
      rationale: "Port conflict cleanup before subsystem repair.",
      commands: ports.map((port) => `lsof -ti :${port} | xargs kill -9`),
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "planned",
    },
  ];
}

export async function buildPlan(cwd: string, detection: EnvDetection, config: Config, flags: CliFlags): Promise<FixStep[]> {
  const steps: FixStep[] = [];

  // strict order: env -> engines -> ports -> docker -> node -> python -> checks(format, lint, test)
  steps.push(...await buildEnvSteps(cwd, detection, config, flags));
  steps.push(...await buildEngineSteps(cwd, detection, config, flags));
  steps.push(...buildPortSteps(flags, config));

  if (flags.focus === "all" || flags.focus === "docker") steps.push(...buildDockerSteps(detection, config, flags));
  if (flags.focus === "all" || flags.focus === "node") steps.push(...buildNodeSteps(detection, config, flags));
  if (flags.focus === "all" || flags.focus === "python") steps.push(...buildPythonSteps(detection, config, flags));

  const checks: FixStep[] = [];
  if (flags.focus === "all" || flags.focus === "node") checks.push(...buildCheckSteps(detection, config, flags, "node"));
  if (flags.focus === "all" || flags.focus === "python") checks.push(...buildCheckSteps(detection, config, flags, "python"));

  const order = { format: 1, lint: 2, test: 3 } as const;
  checks.sort((a, b) => (order[a.checkKind ?? "test"] - order[b.checkKind ?? "test"]));
  steps.push(...checks);

  return steps;
}
