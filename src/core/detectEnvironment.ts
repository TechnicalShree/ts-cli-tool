import path from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type { Config, EnvDetection } from "../types.js";
import { fileExists } from "../utils/fs.js";

async function detectPackageManager(cwd: string): Promise<"npm" | "pnpm" | "yarn" | "unknown"> {
  if (await fileExists(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(path.join(cwd, "yarn.lock"))) return "yarn";
  if (await fileExists(path.join(cwd, "package-lock.json"))) return "npm";
  return "unknown";
}

async function detectLockfileCorruption(cwd: string): Promise<boolean> {
  const pkgLock = path.join(cwd, "package-lock.json");
  if (await fileExists(pkgLock)) {
    try {
      JSON.parse(await readFile(pkgLock, "utf8"));
    } catch {
      return true;
    }
  }
  const pnpmLock = path.join(cwd, "pnpm-lock.yaml");
  if (await fileExists(pnpmLock)) {
    try {
      parseYaml(await readFile(pnpmLock, "utf8"));
    } catch {
      return true;
    }
  }
  return false;
}

export async function detectEnvironment(cwd: string, config: Config): Promise<EnvDetection> {
  const packageJsonPath = path.join(cwd, "package.json");
  const hasPackage = await fileExists(packageJsonPath);

  let scripts: string[] = [];
  let hasNext = false;
  let hasVite = false;

  if (hasPackage) {
    try {
      const parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      scripts = Object.keys(parsed.scripts ?? {});
      const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
      hasNext = Boolean(deps.next) || scripts.some((s) => s.toLowerCase().includes("next"));
      hasVite = Boolean(deps.vite) || scripts.some((s) => s.toLowerCase().includes("vite"));
    } catch {
      // Ignore malformed package file in detection phase.
    }
  }

  const requirements =
    (await fileExists(path.join(cwd, "requirements.txt"))) ||
    (await fileExists(path.join(cwd, "requirements-dev.txt")));
  const hasPyproject = await fileExists(path.join(cwd, "pyproject.toml"));
  const venvPath = path.join(cwd, config.python.venv_path);
  const venvExists = await fileExists(venvPath);

  const composeCandidates = ["docker-compose.yml", "compose.yml", "docker-compose.yaml", "compose.yaml"];
  const composeFile = (
    await Promise.all(
      composeCandidates.map(async (name) => ((await fileExists(path.join(cwd, name))) ? name : null)),
    )
  ).find((v) => Boolean(v)) ?? undefined;

  const lockfileCandidates = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock"];
  const lockfiles = (
    await Promise.all(
      lockfileCandidates.map(async (name) => ((await fileExists(path.join(cwd, name))) ? name : null)),
    )
  ).filter((v): v is string => Boolean(v));

  const lockfileCorrupted = await detectLockfileCorruption(cwd);

  const issues: string[] = [];
  if (hasPackage && !(await fileExists(path.join(cwd, "node_modules")))) issues.push("node_modules directory missing");
  if ((hasPyproject || requirements) && !venvExists) issues.push("python virtual environment missing");
  if (composeFile) issues.push("docker compose project detected (state may require refresh)");
  if (lockfileCorrupted) issues.push("lockfile appears corrupted; frozen installs likely to fail");

  return {
    node: {
      detected: hasPackage,
      packageManager: await detectPackageManager(cwd),
      hasNodeModules: await fileExists(path.join(cwd, "node_modules")),
      hasNext,
      hasVite,
      lockfiles,
      lockfileCorrupted,
      packageScripts: scripts,
    },
    python: {
      detected: hasPyproject || requirements,
      hasPyproject,
      hasRequirements: requirements,
      venvPath: config.python.venv_path,
      venvExists,
    },
    docker: { detected: Boolean(composeFile), composeFile },
    issues,
  };
}
