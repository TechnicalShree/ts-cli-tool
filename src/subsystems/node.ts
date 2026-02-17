import type { CliFlags, Config, EnvDetection, FixStep } from "../types.js";

function choosePm(detected: EnvDetection["node"]["packageManager"], configured: Config["node"]["package_manager"]) {
  if (configured !== "auto") return configured;
  if (detected === "unknown") return "npm";
  return detected;
}

export function buildNodeSteps(detection: EnvDetection, config: Config, flags: CliFlags): FixStep[] {
  if (!detection.node.detected) return [];

  const pm = choosePm(detection.node.packageManager, config.node.package_manager);
  const steps: FixStep[] = [];

  if (!detection.node.hasNodeModules) {
    steps.push({
      id: "node-install-deps",
      title: "Install Node dependencies",
      subsystem: "node",
      rationale: "package.json found and node_modules appears missing.",
      commands: [`${pm} install`],
      destructive: false,
      status: "planned",
    });
  }

  if (detection.node.hasNext && config.node.caches.next) {
    steps.push({
      id: "node-clean-next-cache",
      title: "Clean Next.js cache",
      subsystem: "node",
      rationale: "Next.js cache can cause stale build/runtime state.",
      commands: ["rm -rf .next"],
      destructive: false,
      status: "planned",
    });
  }

  if (detection.node.hasVite && config.node.caches.vite) {
    steps.push({
      id: "node-clean-vite-cache",
      title: "Clean Vite cache",
      subsystem: "node",
      rationale: "Vite cache corruption is a common local issue.",
      commands: ["rm -rf node_modules/.vite"],
      destructive: false,
      status: "planned",
    });
  }

  for (const cacheDir of config.node.caches.directories) {
    steps.push({
      id: `node-clean-cache-${cacheDir.replace(/[^a-z0-9]/gi, "-")}`,
      title: `Clean cache directory ${cacheDir}`,
      subsystem: "node",
      rationale: "Configured cache directory cleanup.",
      commands: [`rm -rf ${cacheDir}`],
      destructive: false,
      status: "planned",
    });
  }

  if (flags.deep && config.node.deep_cleanup.remove_node_modules) {
    steps.push({
      id: "node-remove-node-modules",
      title: "Remove node_modules for clean reinstall",
      subsystem: "node",
      rationale: "Deep cleanup requested to resolve dependency drift.",
      commands: ["rm -rf node_modules", `${pm} install`],
      destructive: true,
      status: "planned",
    });
  }

  if (flags.deep && config.node.deep_cleanup.remove_lockfile) {
    steps.push({
      id: "node-remove-lockfiles",
      title: "Remove lockfiles",
      subsystem: "node",
      rationale: "Deep lockfile reset requested by configuration.",
      commands: ["rm -f package-lock.json pnpm-lock.yaml yarn.lock", `${pm} install`],
      destructive: true,
      status: "planned",
    });
  }

  return steps;
}
