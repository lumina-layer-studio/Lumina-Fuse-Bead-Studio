import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import {
  BeadProjectValidationError,
  createBeadRecipeSource,
  restoreBeadProjectFromRecipeSource,
} from "../src/domain/project";

async function fixture() {
  return JSON.parse(
    await readFile("test/fixtures/bead-recipe-v1.json", "utf8"),
  );
}

describe("bead recipe compatibility", () => {
  it("restores the in-tree bead-recipe/v1 payload without migration loss", async () => {
    const source = await fixture();
    const restored = restoreBeadProjectFromRecipeSource(source, {
      projectId: "restored",
      now: "2030-01-01T00:00:00.000Z",
    });

    expect(createBeadRecipeSource(restored).payload).toEqual(
      source.payload,
    );
  });

  it.each([
    ["module ID", { moduleId: "other.module" }],
    [
      "payload version",
      { payload: { payloadVersion: "bead-recipe/v2" } },
    ],
    ["grid product", { payload: { cellsRle: [[0, 1]] } }],
    [
      "palette index",
      { payload: { cellsRle: [[99, 6]] } },
    ],
    ["pitch", { payload: { beadPitchMm: 0.1 } }],
    ["compression", { payload: { compression: 101 } }],
  ])("rejects invalid %s data", async (_label, patch) => {
    const source = await fixture();
    const candidate = {
      ...source,
      ...patch,
      payload: {
        ...source.payload,
        ...("payload" in patch ? patch.payload : {}),
      },
    };
    expect(() =>
      restoreBeadProjectFromRecipeSource(candidate),
    ).toThrowError(BeadProjectValidationError);
  });

  it("rejects a recipe control payload over 1 MiB", async () => {
    const source = await fixture();
    expect(() =>
      restoreBeadProjectFromRecipeSource({
        ...source,
        payload: {
          ...source.payload,
          padding: "x".repeat(1024 * 1024),
        },
      }),
    ).toThrowError(BeadProjectValidationError);
  });
});
