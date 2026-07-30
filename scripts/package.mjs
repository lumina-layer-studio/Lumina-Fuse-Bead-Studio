import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { zipSync } from "fflate";

const MAX_PACKAGE_BYTES = 100 * 1024 * 1024;
const FIXED_MTIME = new Date("2000-01-01T00:00:00.000Z");

async function readJson(file) {
  const text = await readFile(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `${file} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function atomicWrite(file, bytes) {
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

const packageJson = await readJson("package.json");
const manifest = await readJson("manifest.json");
if (
  typeof packageJson.version !== "string" ||
  manifest.version !== packageJson.version
) {
  throw new Error(
    "manifest.json version must exactly match package.json version.",
  );
}
if (
  manifest.manifestVersion !== 1 ||
  manifest.id !== "lumina.bead-pattern" ||
  manifest.entrypoints?.ui !== "ui/index.html"
) {
  throw new Error("manifest.json does not describe the v1 bead module.");
}

const entrySources = [
  ["LICENSE", "LICENSE"],
  ["README.md", "README.md"],
  ["assets/icon.png", "public/assets/icon.png"],
  ["manifest.json", "manifest.json"],
  ["ui/index.html", "dist/ui/index.html"],
].sort(([left], [right]) => left.localeCompare(right));

const entries = [];
let uncompressedBytes = 0;
for (const [entryName, sourcePath] of entrySources) {
  const bytes = await readFile(sourcePath);
  if (bytes.byteLength === 0) {
    throw new Error(`${sourcePath} is empty.`);
  }
  uncompressedBytes += bytes.byteLength;
  entries.push([
    entryName,
    [bytes, { mtime: FIXED_MTIME, level: 9 }],
  ]);
}
if (uncompressedBytes > MAX_PACKAGE_BYTES) {
  throw new Error("Workshop package inputs exceed 100 MiB.");
}

const archive = zipSync(Object.fromEntries(entries), { level: 9 });
if (archive.byteLength > MAX_PACKAGE_BYTES) {
  throw new Error("Workshop package archive exceeds 100 MiB.");
}

const assetName = `${manifest.id}-${manifest.version}.lumina-workshop`;
const outputDirectory = "artifacts";
const outputPath = path.join(outputDirectory, assetName);
const checksumPath = `${outputPath}.sha256`;
const checksum = createHash("sha256").update(archive).digest("hex");

await mkdir(outputDirectory, { recursive: true });
await atomicWrite(outputPath, archive);
await atomicWrite(
  checksumPath,
  `${checksum}  ${assetName}\n`,
);

process.stdout.write(
  `${outputPath}\nsha256 ${checksum}\n`,
);
