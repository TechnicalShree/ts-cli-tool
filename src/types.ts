export type Subsystem = "node" | "python" | "docker" | "checks" | "meta";

export type StepStatus = "planned" | "proposed" | "running" | "success" | "failed" | "skipped" | "partial";

export type CheckKind = "lint" | "test" | "format";

export interface CliFlags {
  dryRun: boolean;
  deep: boolean;
  approve: boolean;
  forceFresh: boolean;
  focus: "node" | "python" | "docker" | "all";
  checks?: CheckKind[];
  killPorts?: number[];
  verbose: boolean;
  quiet: boolean;
  noColor: boolean;
  reportPath?: string;
  json: boolean;
  run: boolean;
}

export interface CommandContext {
  command:
    | "run"
    | "doctor"
    | "plan"
    | "report"
    | "undo"
    | "clear-npm-cache"
    | "clear-yarn-cache"
    | "clear-pnpm-cache";
  cwd: string;
  runId: string;
  flags: CliFlags;
  interactive: boolean;
}

export interface UndoHint {
  action: string;
  command?: string;
}

export interface FixStep {
  id: string;
  title: string;
  subsystem: Subsystem;
  phase: "detect" | "ports" | "docker" | "node" | "python" | "checks";
  checkKind?: CheckKind;
  rationale: string;
  commands: string[];
  destructive: boolean;
  irreversible: boolean;
  undoable: boolean;
  irreversibleReason?: string;
  undoHints?: UndoHint[];
  snapshotPaths?: string[];
  status: StepStatus;
  output?: string;
  error?: string;
  proposedReason?: string;
  skippedReason?: string;
}

export interface EnvDetection {
  node: {
    detected: boolean;
    packageManager: "npm" | "pnpm" | "yarn" | "unknown";
    hasNodeModules: boolean;
    hasNext: boolean;
    hasVite: boolean;
    lockfiles: string[];
    lockfileCorrupted: boolean;
    packageScripts: string[];
  };
  python: {
    detected: boolean;
    hasPyproject: boolean;
    hasRequirements: boolean;
    venvPath: string;
    venvExists: boolean;
  };
  docker: {
    detected: boolean;
    composeFile?: string;
  };
  issues: string[];
}

export interface Config {
  version: number;
  ports: { default: number[]; extra: number[] };
  node: {
    package_manager: "auto" | "npm" | "pnpm" | "yarn";
    deep_cleanup: { remove_node_modules: boolean; remove_lockfile: boolean };
    caches: { next: boolean; vite: boolean; directories: string[] };
  };
  python: {
    venv_path: string;
    install: { prefer: "uv" | "pip" | "poetry" | "pipenv" | "auto" };
    tools: { format: string[]; lint: string[]; test: string[] };
  };
  docker: {
    compose_file: string;
    safe_down: boolean;
    rebuild: boolean;
    prune: boolean;
  };
  checks: { default: CheckKind[] };
  output: {
    report_dir: string;
    snapshot_dir: string;
    verbosity: "quiet" | "normal" | "verbose";
  };
}

export interface RunSummary {
  detectedEnvironment: string[];
  actions: string[];
  succeeded: number;
  failed: number;
  skipped: number;
  nextBestAction: string;
  undoCoverage: "full" | "partial";
  irreversibleStepIds: string[];
  warnings: string[];
}

export interface UndoEntry {
  stepId: string;
  snapshotPaths: string[];
  restored: string[];
  skipped: string[];
  missingSnapshot: string[];
  failed: string[];
  nextBestAction?: string;
}

export interface RunReport {
  runId: string;
  command: CommandContext["command"];
  cwd: string;
  startedAt: string;
  finishedAt?: string;
  flags: CliFlags;
  detection: EnvDetection;
  steps: FixStep[];
  summary: RunSummary;
  undo: UndoEntry[];
  storage: {
    reportDir: string;
    snapshotDir: string;
    fallbackToTemp: boolean;
  };
}
