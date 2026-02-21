import type { CliFlags, Config, EnvDetection, FixStep } from "../types.js";

function installCommand(prefer: Config["python"]["install"]["prefer"]): string {
  switch (prefer) {
    case "uv":
      return "uv pip install -r requirements.txt";
    case "poetry":
      return "poetry install";
    case "pipenv":
      return "pipenv install";
    case "pip":
      return "pip install -r requirements.txt";
    default:
      return "pip install -r requirements.txt";
  }
}

export function buildPythonSteps(detection: EnvDetection, config: Config, flags: CliFlags): FixStep[] {
  if (!detection.python.detected) return [];
  const steps: FixStep[] = [];

  if (!detection.python.venvExists) {
    steps.push({
      id: "python-create-venv",
      title: "Create Python virtual environment",
      subsystem: "python",
      phase: "python",
      rationale: "Python project detected without configured virtual environment.",
      commands: [`python3 -m venv ${config.python.venv_path}`],
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "planned",
    });
  }

  if (detection.python.hasRequirements || detection.python.hasPyproject) {
    steps.push({
      id: "python-install-deps",
      title: "Install Python dependencies",
      subsystem: "python",
      phase: "python",
      rationale: "Dependency refresh to resolve environment drift.",
      commands: [installCommand(config.python.install.prefer)],
      destructive: false,
      irreversible: false,
      undoable: false,
      status: "planned",
    });
  }

  if (flags.deep) {
    steps.push({
      id: "python-reset-venv",
      title: "IRREVERSIBLE: Reset Python virtual environment",
      subsystem: "python",
      phase: "python",
      rationale: "Deep cleanup for persistent Python environment drift.",
      commands: [`rm -rf ${config.python.venv_path}`, `python3 -m venv ${config.python.venv_path}`],
      destructive: true,
      irreversible: true,
      irreversibleReason: "cannot restore environment state fully",
      undoable: false,
      undoHints: [{ action: "Reinstall dependencies", command: installCommand(config.python.install.prefer) }],
      status: "planned",
    });
  }

  // PRD v1.2: IDE Integration Auto-Configuration for VS Code
  steps.push({
    id: "python-vscode-sync",
    title: "Sync Python virtual environment with VS Code",
    subsystem: "python",
    phase: "python",
    rationale: "VS Code needs to know the correct virtual environment path to prevent linting errors.",
    commands: [
      `mkdir -p .vscode && node -e "const fs=require('fs');const p='.vscode/settings.json';let s={};try{s=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){}s['python.defaultInterpreterPath']='${config.python.venv_path}';fs.writeFileSync(p,JSON.stringify(s,null,2))"`
    ],
    destructive: false,
    irreversible: false,
    undoable: true,
    snapshotPaths: [".vscode/settings.json"],
    undoHints: [{ action: "Restore .vscode/settings.json" }],
    status: "planned",
  });

  return steps;
}
