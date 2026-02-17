import type { CliFlags, Config, EnvDetection, FixStep } from "../types.js";

function composePrefix(detection: EnvDetection): string {
  if (!detection.docker.composeFile) return "docker compose";
  return `docker compose -f ${detection.docker.composeFile}`;
}

export function buildDockerSteps(detection: EnvDetection, config: Config, flags: CliFlags): FixStep[] {
  if (!detection.docker.detected) return [];
  const steps: FixStep[] = [];
  const prefix = composePrefix(detection);

  if (config.docker.safe_down) {
    steps.push({
      id: "docker-compose-down",
      title: "Run docker compose down",
      subsystem: "docker",
      rationale: "Reset stale compose state safely.",
      commands: [`${prefix} down`],
      destructive: false,
      status: "planned",
    });
  }

  if (config.docker.rebuild) {
    steps.push({
      id: "docker-compose-rebuild",
      title: "Rebuild docker compose services",
      subsystem: "docker",
      rationale: "Rebuild services to resolve dirty container/image state.",
      commands: [`${prefix} up -d --build`],
      destructive: false,
      status: "planned",
    });
  }

  if (flags.deep || config.docker.prune) {
    steps.push({
      id: "docker-prune",
      title: "Prune docker system",
      subsystem: "docker",
      rationale: "Deep cleanup requested for stale docker artifacts.",
      commands: ["docker system prune -f"],
      destructive: true,
      status: "planned",
    });
  }

  return steps;
}
