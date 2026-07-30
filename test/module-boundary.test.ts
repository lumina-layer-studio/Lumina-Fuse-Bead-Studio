import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const file = path.join(root, entry.name);
        return entry.isDirectory() ? sourceFiles(file) : [file];
      }),
    )
  ).flat();
}

describe("module boundary", () => {
  it("depends on Lumina only through the public Workshop SDK", async () => {
    const files = (await sourceFiles("src")).filter((file) =>
      /\.tsx?$/.test(file),
    );
    const text = (
      await Promise.all(files.map((file) => readFile(file, "utf8")))
    ).join("\n");
    expect(text).not.toMatch(
      /Lumina-studio|frontend\/src|\.\.\/\.\.\/components|\.\.\/\.\.\/store/,
    );
    expect(text).not.toMatch(
      /from ["']@lumina\/(?!workshop-sdk)/,
    );
  });
});
