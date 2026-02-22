import path from "node:path";
import { readFile } from "node:fs/promises";
import type { CliFlags, Config, EnvDetection, FixStep } from "../types.js";
import { fileExists } from "../utils/fs.js";
import { shellQuote } from "../utils/process.js";

/** Strict env key sanitizer: only allow [A-Z0-9_] */
function sanitizeEnvKey(key: string): string {
    return key.replace(/[^A-Z0-9_]/gi, "");
}

async function parseEnvKeys(filePath: string): Promise<string[]> {
    try {
        const raw = await readFile(filePath, "utf8");
        const keys: string[] = [];
        for (const line of raw.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) continue;
            const idx = trimmed.indexOf("=");
            if (idx > 0) {
                const key = sanitizeEnvKey(trimmed.substring(0, idx).trim());
                if (key) keys.push(key);
            }
        }
        return keys;
    } catch {
        return [];
    }
}

async function findMissingKeys(envPath: string, envExamplePath: string): Promise<string[]> {
    const envKeys = new Set(await parseEnvKeys(envPath));
    const exampleKeys = await parseEnvKeys(envExamplePath);
    return exampleKeys.filter((k) => !envKeys.has(k));
}

export async function buildEnvSteps(cwd: string, detection: EnvDetection, config: Config, flags: CliFlags): Promise<FixStep[]> {
    if (!detection.environment.hasEnvExample) return [];

    const steps: FixStep[] = [];
    const envPath = path.join(cwd, ".env");
    const envExamplePath = path.join(cwd, ".env.example");

    if (!detection.environment.hasEnv) {
        steps.push({
            id: "env-sync-copy-example",
            title: "Copy .env.example to .env",
            subsystem: "environment",
            phase: "environment",
            rationale: ".env is missing but .env.example exists.",
            commands: [`cp ${shellQuote(envExamplePath)} ${shellQuote(envPath)}`],
            destructive: false,
            irreversible: false,
            undoable: true,
            snapshotPaths: [".env.example"],
            undoHints: [{ action: "Delete .env", command: `rm -f ${shellQuote(envPath)}` }],
            status: "planned",
        });
    } else {
        const missingKeys = await findMissingKeys(envPath, envExamplePath);
        if (missingKeys.length > 0) {
            // Keys are already sanitized to [A-Z0-9_] only — safe for shell interpolation
            const appends = missingKeys.map((k) => `echo ${shellQuote(`${k}=`)} >> ${shellQuote(envPath)}`).join(" && ");
            steps.push({
                id: "env-sync-append-missing",
                title: `Append ${missingKeys.length} missing key(s) to .env`,
                subsystem: "environment",
                phase: "environment",
                rationale: `.env is out of sync with .env.example (missing keys: ${missingKeys.join(", ")}).`,
                commands: [appends],
                destructive: false,
                irreversible: false,
                undoable: true,
                snapshotPaths: [".env"],
                undoHints: [{ action: "Restore original .env" }],
                status: "planned",
            });
        }
    }

    return steps;
}
