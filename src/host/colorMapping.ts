import type {
  WorkshopColorEntry,
  WorkshopColorLibrary,
} from "@lumina/workshop-sdk";

import type {
  BeadPrintMapping,
  BeadProject,
  RgbColor,
} from "../domain/types";

interface LabColor {
  l: number;
  a: number;
  b: number;
}

export interface BeadColorMappingResult {
  sourcePalette: RgbColor[];
  previewPalette: RgbColor[];
  printMapping: BeadPrintMapping | null;
  stale: boolean;
}

interface ValidLibraryColor {
  entry: WorkshopColorEntry;
  rgb: RgbColor;
  lab: LabColor;
}

function parseHexColor(value: string): RgbColor | null {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const number = Number.parseInt(match[1], 16);
  return [
    (number >> 16) & 255,
    (number >> 8) & 255,
    number & 255,
  ];
}

function linearChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function pivotXyz(value: number): number {
  const delta = 6 / 29;
  return value > delta ** 3
    ? Math.cbrt(value)
    : value / (3 * delta ** 2) + 4 / 29;
}

function rgbToLab(color: RgbColor): LabColor {
  const red = linearChannel(color[0]);
  const green = linearChannel(color[1]);
  const blue = linearChannel(color[2]);
  const x =
    (red * 0.4124564 +
      green * 0.3575761 +
      blue * 0.1804375) /
    0.95047;
  const y =
    (red * 0.2126729 +
      green * 0.7151522 +
      blue * 0.072175) /
    1;
  const z =
    (red * 0.0193339 +
      green * 0.119192 +
      blue * 0.9503041) /
    1.08883;
  const fx = pivotXyz(x);
  const fy = pivotXyz(y);
  const fz = pivotXyz(z);
  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function labDistanceSquared(left: LabColor, right: LabColor): number {
  return (
    (left.l - right.l) ** 2 +
    (left.a - right.a) ** 2 +
    (left.b - right.b) ** 2
  );
}

function validColors(
  library: WorkshopColorLibrary,
): ValidLibraryColor[] {
  return library.colors.flatMap((entry) => {
    const rgb = parseHexColor(entry.hex);
    return rgb ? [{ entry, rgb, lab: rgbToLab(rgb) }] : [];
  });
}

function nearestEntryId(
  source: RgbColor,
  candidates: readonly ValidLibraryColor[],
): string {
  const sourceLab = rgbToLab(source);
  let best = candidates[0];
  let bestDistance = labDistanceSquared(sourceLab, best.lab);
  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const distance = labDistanceSquared(sourceLab, candidate.lab);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best.entry.id;
}

function cloneMapping(mapping: BeadPrintMapping): BeadPrintMapping {
  return {
    libraryId: mapping.libraryId,
    libraryLabel: mapping.libraryLabel,
    entries: mapping.entries.map((entry) => ({ ...entry })),
  };
}

function previewPalette(
  sourcePalette: readonly RgbColor[],
  mapping: BeadPrintMapping,
  library: WorkshopColorLibrary,
): RgbColor[] {
  const colorsById = new Map(
    library.colors.flatMap((entry) => {
      const rgb = parseHexColor(entry.hex);
      return rgb ? [[entry.id, rgb] as const] : [];
    }),
  );
  const entriesByPaletteIndex = new Map(
    mapping.entries.map((entry) => [
      entry.sourcePaletteIndex,
      entry.colorEntryId,
    ]),
  );
  return sourcePalette.map((source, index) => {
    const colorEntryId = entriesByPaletteIndex.get(index);
    const printColor = colorEntryId
      ? colorsById.get(colorEntryId)
      : undefined;
    return printColor
      ? ([...printColor] as RgbColor)
      : ([...source] as RgbColor);
  });
}

export function mapProjectToColorLibrary(
  project: Pick<BeadProject, "palette" | "printMapping">,
  library: WorkshopColorLibrary | null,
): BeadColorMappingResult {
  const sourcePalette = project.palette.map(
    (color) => [...color] as RgbColor,
  );
  if (!library) {
    return {
      sourcePalette,
      previewPalette: sourcePalette.map(
        (color) => [...color] as RgbColor,
      ),
      printMapping: null,
      stale: false,
    };
  }

  const existing = project.printMapping ?? null;
  if (existing && existing.libraryId !== library.id) {
    return {
      sourcePalette,
      previewPalette: sourcePalette.map(
        (color) => [...color] as RgbColor,
      ),
      printMapping: cloneMapping(existing),
      stale: true,
    };
  }

  const candidates = validColors(library);
  if (candidates.length === 0) {
    return {
      sourcePalette,
      previewPalette: sourcePalette.map(
        (color) => [...color] as RgbColor,
      ),
      printMapping: null,
      stale: false,
    };
  }
  const candidateIds = new Set(
    candidates.map(({ entry }) => entry.id),
  );
  const existingByIndex = new Map(
    existing?.entries.map((entry) => [
      entry.sourcePaletteIndex,
      entry.colorEntryId,
    ]) ?? [],
  );
  const printMapping: BeadPrintMapping = {
    libraryId: library.id,
    libraryLabel: library.label,
    entries: sourcePalette.map((color, sourcePaletteIndex) => {
      const retained = existingByIndex.get(sourcePaletteIndex);
      return {
        sourcePaletteIndex,
        colorEntryId:
          retained && candidateIds.has(retained)
            ? retained
            : nearestEntryId(color, candidates),
      };
    }),
  };
  return {
    sourcePalette,
    previewPalette: previewPalette(
      sourcePalette,
      printMapping,
      library,
    ),
    printMapping,
    stale: false,
  };
}

export function setManualColorMapping(
  mapping: BeadPrintMapping,
  library: WorkshopColorLibrary,
  sourcePaletteIndex: number,
  colorEntryId: string,
): BeadPrintMapping {
  if (
    mapping.libraryId !== library.id ||
    !Number.isInteger(sourcePaletteIndex) ||
    sourcePaletteIndex < 0 ||
    !library.colors.some((entry) => entry.id === colorEntryId)
  ) {
    return cloneMapping(mapping);
  }
  const entries = mapping.entries
    .filter((entry) => entry.sourcePaletteIndex !== sourcePaletteIndex)
    .concat({ sourcePaletteIndex, colorEntryId })
    .sort(
      (left, right) =>
        left.sourcePaletteIndex - right.sourcePaletteIndex,
    );
  return {
    libraryId: mapping.libraryId,
    libraryLabel: library.label,
    entries,
  };
}

export function projectForPrintPreview(
  project: BeadProject,
  mapping: BeadColorMappingResult,
): BeadProject {
  if (!mapping.printMapping || mapping.stale) return project;
  return {
    ...project,
    palette: mapping.previewPalette.map(
      (color) => [...color] as RgbColor,
    ),
  };
}
