import type { CliFlags, Config, EnvDetection, FixStep } from "../types.js";

function choosePm(detected: EnvDetection["node"]["packageManager"], configured: Config["node"]["package_manager"]) {
  if (configured !== "auto") return configured;
  if (detected === "unknown") return "npm";
  return detected;
}

function frozenInstall(pm: "npm" | "pnpm" | "yarn"): string {
  if (pm === "pnpm") return "pnpm install --frozen-lockfile";
  if (pm === "yarn") return "yarn install --frozen-lockfile";
  return "npm ci";
}

export function buildNodeSteps(detection: EnvDetection, config: Config, flags: CliFlags): FixStep[] {
  if (!detection.node.detected) return [];

  const pm = choosePm(detection.node.packageManager, config.node.package_manager);
  const steps: FixStep[] = [];

  if (detection.node.lockfileCorrupted) {
    steps.push({
      id: "node-lockfile-corruption-detected",
      title: "Lockfile corruption detected",
      subsystem: "node",
      phase: "node",
      rationale: "Lockfile parse failure detected; frozen install strategy will likely fail.",
      commands: [],
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "proposed",
      proposedReason: "Recommend fresh regeneration with --force-fresh and --deep/--approve",
    });

    if (flags.forceFresh && (flags.deep || flags.approve)) {
      steps.push({
        id: "node-remove-lockfiles-force-fresh",
        title: "IRREVERSIBLE: Remove corrupted lockfiles and regenerate",
        subsystem: "node",
        phase: "node",
        rationale: "Forced fresh recovery for corrupted lockfile.",
        commands: ["rm -f package-lock.json pnpm-lock.yaml yarn.lock", `${pm} install`],
        destructive: true,
        irreversible: true,
        irreversibleReason: "cannot be snapshotted reliably if unreadable/corrupt",
        undoable: false,
        undoHints: [{ action: "Regenerate lockfile", command: `${pm} install` }],
        status: "planned",
      });
    }
  }

  if (!detection.node.hasNodeModules) {
    steps.push({
      id: "node-install-deps",
      title: "Install Node dependencies",
      subsystem: "node",
      phase: "node",
      rationale: "package.json found and node_modules appears missing.",
      commands: [detection.node.lockfileCorrupted ? `${pm} install` : frozenInstall(pm)],
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "planned",
    });
  }

  if (detection.node.hasNext && config.node.caches.next) {
    steps.push({
      id: "node-clean-next-cache",
      title: "Clean Next.js cache",
      subsystem: "node",
      phase: "node",
      rationale: "Next.js cache can cause stale build/runtime state.",
      commands: ["rm -rf .next"],
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "planned",
    });
  }

  if (detection.node.hasVite && config.node.caches.vite) {
    steps.push({
      id: "node-clean-vite-cache",
      title: "Clean Vite cache",
      subsystem: "node",
      phase: "node",
      rationale: "Vite cache corruption is a common local issue.",
      commands: ["rm -rf node_modules/.vite"],
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "planned",
    });
  }

  for (const cacheDir of config.node.caches.directories) {
    steps.push({
      id: `node-clean-cache-${cacheDir.replace(/[^a-z0-9]/gi, "-")}`,
      title: `Clean cache directory ${cacheDir}`,
      subsystem: "node",
      phase: "node",
      rationale: "Configured cache directory cleanup.",
      commands: [`rm -rf ${cacheDir}`],
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "planned",
    });
  }

  if (flags.deep && config.node.deep_cleanup.remove_node_modules) {
    steps.push({
      id: "node-remove-node-modules",
      title: "IRREVERSIBLE: Remove node_modules for clean reinstall",
      subsystem: "node",
      phase: "node",
      rationale: "Deep cleanup requested to resolve dependency drift.",
      commands: ["rm -rf node_modules", `${pm} install`],
      destructive: true,
      irreversible: true,
      irreversibleReason: "large folder not snapshotted in MVP",
      undoable: false,
      undoHints: [{ action: "Reinstall dependencies", command: `${pm} install` }],
      status: "planned",
    });
  }

  return steps;
}
