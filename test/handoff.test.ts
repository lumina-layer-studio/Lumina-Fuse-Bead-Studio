import { zlibSync, unzlibSync } from "fflate";
import { describe, expect, it } from "vitest";

import { createBeadProject } from "../src/domain/project";
import { renderBeadProject } from "../src/domain/renderer";
import { BEAD_MODULE_VERSION } from "../src/domain/types";
import {
  prepareBeadHandoff,
  toWorkshopImageHandoff,
} from "../src/host/handoff";
import type { BeadImageCodec } from "../src/host/imageCodec";

function uint32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function join(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  return join([
    uint32(data.length),
    typeBytes,
    data,
    uint32(crc32(join([typeBytes, data]))),
  ]);
}

function encodePng(
  width: number,
  height: number,
  rgba: Uint8ClampedArray,
): Uint8Array {
  const scanlines = new Uint8Array(height * (1 + width * 4));
  for (let row = 0; row < height; row += 1) {
    const target = row * (1 + width * 4);
    scanlines[target] = 0;
    scanlines.set(
      rgba.subarray(row * width * 4, (row + 1) * width * 4),
      target + 1,
    );
  }
  const header = new Uint8Array(13);
  header.set(uint32(width), 0);
  header.set(uint32(height), 4);
  header.set([8, 6, 0, 0, 0], 8);
  return join([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", zlibSync(scanlines)),
    chunk("IEND", new Uint8Array()),
  ]);
}

function decodePng(bytes: Uint8Array) {
  const width = new DataView(
    bytes.buffer,
    bytes.byteOffset + 16,
    4,
  ).getUint32(0);
  const height = new DataView(
    bytes.buffer,
    bytes.byteOffset + 20,
    4,
  ).getUint32(0);
  const idat: Uint8Array[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const view = new DataView(
      bytes.buffer,
      bytes.byteOffset + offset,
      4,
    );
    const length = view.getUint32(0);
    const type = new TextDecoder().decode(
      bytes.subarray(offset + 4, offset + 8),
    );
    if (type === "IDAT") {
      idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    }
    offset += 12 + length;
  }
  const raw = unzlibSync(join(idat));
  const rgba = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    expect(raw[row * (1 + width * 4)]).toBe(0);
    rgba.set(
      raw.subarray(
        row * (1 + width * 4) + 1,
        (row + 1) * (1 + width * 4),
      ),
      row * width * 4,
    );
  }
  return { width, height, rgba };
}

const pngCodec: BeadImageCodec = {
  decode: async () => {
    throw new Error("not used");
  },
  encodePng: async (raster) =>
    encodePng(raster.width, raster.height, raster.data).buffer,
};

describe("bead handoff", () => {
  it("hands off source colors while naming the previewed print library", async () => {
    const project = createBeadProject({
      projectId: "handoff-source",
      moduleVersion: "1.0.0",
      now: "2026-07-30T00:00:00.000Z",
      rows: 1,
      columns: 1,
      palette: [[250, 20, 30]],
      cells: [{ kind: "color", paletteIndex: 0 }],
      compression: 100,
      printMapping: {
        libraryId: "material-archive:official",
        libraryLabel: "官方 PLA",
        entries: [
          {
            sourcePaletteIndex: 0,
            colorEntryId: "print-dark-red",
          },
        ],
      },
    });
    const rendered = renderBeadProject(project, {
      compression: project.compression,
      pixelsPerCell: 32,
    });
    const prepared = await prepareBeadHandoff(
      project,
      rendered,
      pngCodec,
      project.printMapping?.libraryId ?? null,
    );
    const handoff = toWorkshopImageHandoff(prepared);
    const decoded = decodePng(new Uint8Array(handoff.pngBytes));
    const centre = (16 * decoded.width + 16) * 4;

    expect([...decoded.rgba.slice(centre, centre + 3)]).toEqual(
      project.palette[0],
    );
    expect(handoff.colorLibraryId).toBe(
      "material-archive:official",
    );
    expect(handoff.moduleVersion).toBe(BEAD_MODULE_VERSION);
    expect(handoff.recipeSource.moduleVersion).toBe(
      BEAD_MODULE_VERSION,
    );
    expect(handoff.layout).toEqual({
      kind: "square-grid",
      rows: 1,
      columns: 1,
      pitchMm: 2.6,
    });
    expect(handoff.recipeSource).toMatchObject({
      projectSchemaVersion: "bead-project/v1",
      renderSchemaVersion: "bead-render/v1",
      payload: { payloadVersion: "bead-recipe/v1" },
    });
  });
});
