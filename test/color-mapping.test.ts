import type { WorkshopColorLibrary } from "@lumina/workshop-sdk";
import { describe, expect, it } from "vitest";

import { createBeadProject } from "../src/domain/project";
import {
  mapProjectToColorLibrary,
  projectForPrintPreview,
  setManualColorMapping,
} from "../src/host/colorMapping";

const NOW = "2026-07-30T00:00:00.000Z";

function project() {
  return createBeadProject({
    projectId: "mapping",
    moduleVersion: "1.0.0",
    now: NOW,
    rows: 1,
    columns: 3,
    palette: [
      [250, 20, 30],
      [10, 220, 80],
    ],
    cells: [
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
    ],
  });
}

function library(
  overrides: Partial<WorkshopColorLibrary> = {},
): WorkshopColorLibrary {
  return {
    id: "material-archive:official-pla:2026-07",
    label: "官方 PLA 2026-07",
    sourceKind: "material-archive",
    colors: [
      {
        id: "red",
        label: "官方红",
        hex: "#E3212A",
        materialId: "official-red",
      },
      {
        id: "green",
        label: "官方绿",
        hex: "#25A55F",
        materialId: "official-green",
      },
    ],
    ...overrides,
  };
}

describe("print color mapping", () => {
  it("maps previews without overwriting recognized source colors", () => {
    const source = project();
    const sourceSnapshot = structuredClone(source.palette);

    const mapped = mapProjectToColorLibrary(source, library());

    expect(mapped.sourcePalette).toEqual(source.palette);
    expect(mapped.printMapping).toEqual({
      libraryId: "material-archive:official-pla:2026-07",
      libraryLabel: "官方 PLA 2026-07",
      entries: [
        { sourcePaletteIndex: 0, colorEntryId: "red" },
        { sourcePaletteIndex: 1, colorEntryId: "green" },
      ],
    });
    expect(mapped.previewPalette).toEqual([
      [227, 33, 42],
      [37, 165, 95],
    ]);
    expect(source.palette).toEqual(sourceSnapshot);
  });

  it("keeps source preview when no current library exists", () => {
    const source = project();
    const mapped = mapProjectToColorLibrary(source, null);

    expect(mapped.printMapping).toBeNull();
    expect(mapped.previewPalette).toEqual(source.palette);
    expect(mapped.stale).toBe(false);
  });

  it("is deterministic and resolves exact ties by source library order", () => {
    const tied = library({
      colors: [
        {
          id: "brand-b",
          label: "品牌 B 红",
          hex: "#E3212A",
          materialId: "brand-b-red",
        },
        {
          id: "brand-a",
          label: "品牌 A 红",
          hex: "#E3212A",
          materialId: "brand-a-red",
        },
      ],
    });
    const source = createBeadProject({
      projectId: "tie",
      moduleVersion: "1.0.0",
      now: NOW,
      rows: 1,
      columns: 1,
      palette: [[227, 33, 42]],
      cells: [{ kind: "color", paletteIndex: 0 }],
    });

    const first = mapProjectToColorLibrary(source, tied);
    const second = mapProjectToColorLibrary(source, tied);

    expect(first).toEqual(second);
    expect(first.printMapping?.entries).toEqual([
      { sourcePaletteIndex: 0, colorEntryId: "brand-b" },
    ]);
    expect(tied.colors).toHaveLength(2);
  });

  it("persists manual choices by stable color entry ID", () => {
    const source = project();
    const automatic = mapProjectToColorLibrary(source, library());
    const manual = setManualColorMapping(
      automatic.printMapping!,
      library(),
      0,
      "green",
    );
    const remapped = mapProjectToColorLibrary(
      { ...source, printMapping: manual },
      library(),
    );

    expect(remapped.printMapping?.entries[0]).toEqual({
      sourcePaletteIndex: 0,
      colorEntryId: "green",
    });
  });

  it("marks a changed library stale instead of silently remapping", () => {
    const source = project();
    const current = mapProjectToColorLibrary(source, library());
    const changed = library({
      id: "lut:new-profile",
      label: "新的 LUT",
      sourceKind: "lut",
    });
    const stale = mapProjectToColorLibrary(
      { ...source, printMapping: current.printMapping },
      changed,
    );

    expect(stale.stale).toBe(true);
    expect(stale.printMapping).toEqual(current.printMapping);
    expect(stale.previewPalette).toEqual(source.palette);
  });

  it("changes only palette rendering and preserves cell identity", () => {
    const source = project();
    const mapped = mapProjectToColorLibrary(source, library());
    const preview = projectForPrintPreview(source, mapped);

    expect(preview.cells).toEqual([
      { kind: "color", paletteIndex: 0 },
      { kind: "empty" },
      { kind: "color", paletteIndex: 1 },
    ]);
    expect(preview.palette[0]).toEqual([227, 33, 42]);
    expect(source.cells).toEqual(preview.cells);
    expect(source.palette[0]).toEqual([250, 20, 30]);
  });
});
