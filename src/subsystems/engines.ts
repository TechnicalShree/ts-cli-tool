import path from "node:path";
import { readFile } from "node:fs/promises";
import type { CliFlags, Config, EnvDetection, FixStep } from "../types.js";

async function readVersionFile(cwd: string, fileName: string): Promise<string | null> {
    try {
        const raw = await readFile(path.join(cwd, fileName), "utf8");
        return raw.trim();
    } catch {
        return null;
    }
}

export async function buildEngineSteps(cwd: string, detection: EnvDetection, config: Config, flags: CliFlags): Promise<FixStep[]> {
    const steps: FixStep[] = [];

    if (detection.node.detected && detection.engines.nodeVersionFile) {
        const desired = await readVersionFile(cwd, detection.engines.nodeVersionFile);
        if (desired) {
            const matchMajor = desired.replace(/^v/, "").split(".")[0];
            const actualMajor = process.version.replace(/^v/, "").split(".")[0];
            if (matchMajor !== actualMajor && matchMajor !== "") {
                steps.push({
                    id: "engines-node-version-mismatch",
                    title: `Node version drift detected: expected ~${matchMajor}, running ${process.version}`,
                    subsystem: "engines",
                    phase: "engines",
                    rationale: `Host Node.js version drifts from ${detection.engines.nodeVersionFile} definition.`,
                    commands: [],
                    destructive: false,
                    irreversible: false,
                    undoable: false,
                    status: "proposed",
                    proposedReason: `Run nvm use or switch Node versions to v${matchMajor}.x`,
                });
            }
        }
    }

    if (detection.python.detected && detection.engines.pythonVersionFile) {
        const desired = await readVersionFile(cwd, detection.engines.pythonVersionFile);
        if (desired) {
            steps.push({
                id: "engines-python-version-mismatch",
                title: `Verify host Python matches ${desired}`,
                subsystem: "engines",
                phase: "engines",
                rationale: `Host Python version should align with ${detection.engines.pythonVersionFile}.`,
                commands: [`python3 -c "import sys; v='.'.join(map(str, sys.version_info[:2])); sys.exit(0 if v.startswith('${desired}') or '${desired}'.startswith(v) else 1)"`],
                destructive: false,
                irreversible: false,
                undoable: false,
                status: "planned",
            });
        }
    }

    return steps;
}
