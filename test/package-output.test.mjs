import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { unzipSync } from "fflate";

const assetName =
  "lumina.bead-pattern-1.0.1.lumina-workshop";
const assetPath = `artifacts/${assetName}`;
const checksumPath = `${assetPath}.sha256`;

test("contains only the fixed v1 package surface", async () => {
  const bytes = await readFile(assetPath);
  const entries = Object.keys(unzipSync(bytes)).sort();
  assert.deepEqual(entries, [
    "LICENSE",
    "README.md",
    "assets/icon.png",
    "manifest.json",
    "ui/index.html",
  ]);

  const expected = createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    await readFile(checksumPath, "utf8"),
    `${expected}  ${assetName}\n`,
  );
});

test("packages byte-for-byte identically on consecutive runs", async () => {
  const first = await readFile(assetPath);
  const result = spawnSync(
    process.execPath,
    ["scripts/package.mjs"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const second = await readFile(assetPath);
  assert.deepEqual(second, first);
});
