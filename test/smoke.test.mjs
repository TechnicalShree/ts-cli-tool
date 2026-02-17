import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("plan command exits successfully", () => {
  const result = spawnSync("node", ["dist/cli.js", "plan", "--no-color"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Detected environment/);
  assert.match(result.stdout, /Plan\/Actions/);
  assert.match(result.stdout, /Results/);
  assert.match(result.stdout, /Next best action/);
});
