import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, writeFile, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";

async function createFixture(files) {
    const dir = await mkdtemp(path.join(tmpdir(), "autofix-test-"));
    for (const [name, content] of Object.entries(files)) {
        const fullPath = path.join(dir, name);
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, content);
    }
    return dir;
}

describe("v1.2: Environment Sync", () => {
    test("buildEnvSteps proposes copy when .env is missing but .env.example exists", async () => {
        const { buildEnvSteps } = await import("../dist/subsystems/environment.js");
        const cwd = await createFixture({ ".env.example": "DB_HOST=localhost\nDB_PORT=5432\n" });
        const detection = {
            node: { detected: false, packageManager: "unknown", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: false, hasPyproject: false, hasRequirements: false, venvPath: ".venv", venvExists: false },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: true },
            engines: {},
            issues: [],
        };
        const config = { python: { venv_path: ".venv" } };
        const flags = {};
        const steps = await buildEnvSteps(cwd, detection, config, flags);
        assert.equal(steps.length, 1);
        assert.equal(steps[0].id, "env-sync-copy-example");
        assert.equal(steps[0].undoable, true);
        await rm(cwd, { recursive: true, force: true });
    });

    test("buildEnvSteps proposes append when .env exists but is missing keys", async () => {
        const { buildEnvSteps } = await import("../dist/subsystems/environment.js");
        const cwd = await createFixture({
            ".env.example": "DB_HOST=localhost\nDB_PORT=5432\nSECRET_KEY=abc\n",
            ".env": "DB_HOST=myhost\n",
        });
        const detection = {
            node: { detected: false, packageManager: "unknown", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: false, hasPyproject: false, hasRequirements: false, venvPath: ".venv", venvExists: false },
            docker: { detected: false },
            environment: { hasEnv: true, hasEnvExample: true },
            engines: {},
            issues: [],
        };
        const config = { python: { venv_path: ".venv" } };
        const flags = {};
        const steps = await buildEnvSteps(cwd, detection, config, flags);
        assert.equal(steps.length, 1);
        assert.equal(steps[0].id, "env-sync-append-missing");
        assert.ok(steps[0].rationale.includes("DB_PORT"));
        assert.ok(steps[0].rationale.includes("SECRET_KEY"));
        await rm(cwd, { recursive: true, force: true });
    });

    test("buildEnvSteps returns empty when no .env.example", async () => {
        const { buildEnvSteps } = await import("../dist/subsystems/environment.js");
        const cwd = await createFixture({ "package.json": "{}" });
        const detection = {
            node: { detected: true, packageManager: "npm", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: false, hasPyproject: false, hasRequirements: false, venvPath: ".venv", venvExists: false },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: false },
            engines: {},
            issues: [],
        };
        const steps = await buildEnvSteps(cwd, detection, {}, {});
        assert.equal(steps.length, 0);
        await rm(cwd, { recursive: true, force: true });
    });
});

describe("v1.2: Engine Checks", () => {
    test("buildEngineSteps produces proposed step for node version mismatch", async () => {
        const { buildEngineSteps } = await import("../dist/subsystems/engines.js");
        const cwd = await createFixture({ ".nvmrc": "v0.0.1\n" });
        const detection = {
            node: { detected: true, packageManager: "npm", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: false, hasPyproject: false, hasRequirements: false, venvPath: ".venv", venvExists: false },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: false },
            engines: { nodeVersionFile: ".nvmrc" },
            issues: [],
        };
        const steps = await buildEngineSteps(cwd, detection, {}, {});
        assert.equal(steps.length, 1);
        assert.equal(steps[0].status, "proposed");
        assert.equal(steps[0].commands.length, 0);
        assert.ok(steps[0].proposedReason.includes("nvm use"));
        await rm(cwd, { recursive: true, force: true });
    });

    test("buildEngineSteps produces proposed step for python version file", async () => {
        const { buildEngineSteps } = await import("../dist/subsystems/engines.js");
        const cwd = await createFixture({ ".python-version": "3.99\n" });
        const detection = {
            node: { detected: false, packageManager: "unknown", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: false, hasPyproject: false, hasRequirements: false, venvPath: ".venv", venvExists: false },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: false },
            engines: { pythonVersionFile: ".python-version" },
            issues: [],
        };
        const steps = await buildEngineSteps(cwd, detection, {}, {});
        assert.equal(steps.length, 1);
        assert.equal(steps[0].status, "proposed");
        assert.equal(steps[0].commands.length, 0, "Python mismatch should be proposed, not executable");
        assert.ok(steps[0].proposedReason.includes("3.99"));
        await rm(cwd, { recursive: true, force: true });
    });

    test("Engine checks fire without project detection (version file only)", async () => {
        const { buildEngineSteps } = await import("../dist/subsystems/engines.js");
        const cwd = await createFixture({ ".nvmrc": "v0.0.1\n" });
        const detection = {
            node: { detected: false, packageManager: "unknown", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: false, hasPyproject: false, hasRequirements: false, venvPath: ".venv", venvExists: false },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: false },
            engines: { nodeVersionFile: ".nvmrc" },
            issues: [],
        };
        const steps = await buildEngineSteps(cwd, detection, {}, {});
        assert.equal(steps.length, 1, "Engine check should fire even without node.detected");
        await rm(cwd, { recursive: true, force: true });
    });
});

describe("v1.2: Python VSCode Sync", () => {
    test("VSCode sync step is NOT added when venv does not exist and is not being created", async () => {
        const { buildPythonSteps } = await import("../dist/subsystems/python.js");
        const detection = {
            node: { detected: false, packageManager: "unknown", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: true, hasPyproject: true, hasRequirements: false, venvPath: ".venv", venvExists: true },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: false },
            engines: {},
            issues: [],
        };
        const config = { python: { venv_path: ".venv", install: { prefer: "pip" }, tools: { format: [], lint: [], test: [] } }, checks: { default: [] } };
        const flags = { deep: false };
        const steps = buildPythonSteps(detection, config, flags);
        const vscodeStep = steps.find((s) => s.id === "python-vscode-sync");
        assert.ok(vscodeStep, "VSCode sync should exist when venv exists");
    });

    test("VSCode sync step is NOT added when venv does not exist and no create step", async () => {
        const { buildPythonSteps } = await import("../dist/subsystems/python.js");
        const detection = {
            node: { detected: false, packageManager: "unknown", hasNodeModules: false, hasNext: false, hasVite: false, lockfiles: [], lockfileCorrupted: false, packageScripts: [] },
            python: { detected: true, hasPyproject: true, hasRequirements: false, venvPath: ".venv", venvExists: false },
            docker: { detected: false },
            environment: { hasEnv: false, hasEnvExample: false },
            engines: {},
            issues: [],
        };
        const config = { python: { venv_path: ".venv", install: { prefer: "pip" }, tools: { format: [], lint: [], test: [] } }, checks: { default: [] } };
        const flags = { deep: false };
        const steps = buildPythonSteps(detection, config, flags);
        // When venv doesn't exist, a create-venv step is added, so vscode sync should also be added
        const createStep = steps.find((s) => s.id === "python-create-venv");
        const vscodeStep = steps.find((s) => s.id === "python-vscode-sync");
        assert.ok(createStep, "create-venv step should exist");
        assert.ok(vscodeStep, "VSCode sync should be added because create-venv step exists");
    });
});
