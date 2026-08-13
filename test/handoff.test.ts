import { zlibSync, unzlibSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import { createBeadProject } from "../src/domain/project";
import { renderBeadProject } from "../src/domain/renderer";
import { renderBeadProjectSvg } from "../src/domain/svgRenderer";
import { BEAD_MODULE_VERSION } from "../src/domain/types";
import {
  handoffPreparedBeadImage,
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
  it("writes bead holes and junction reliefs into printable path geometry", () => {
    const project = createBeadProject({
      projectId: "native-svg-reliefs",
      moduleVersion: "1.0.0",
      now: "2026-08-02T00:00:00.000Z",
      rows: 2,
      columns: 2,
      palette: [[250, 20, 30]],
      cells: Array.from(
        { length: 4 },
        () => ({ kind: "color", paletteIndex: 0 }) as const,
      ),
      compression: 50,
    });

    const svg = renderBeadProjectSvg(project);

    expect(svg).not.toContain("<mask");
    expect(svg).not.toContain("<defs");
    expect(svg).toContain('fill-rule="evenodd"');
    expect((svg.match(/\bM /g) ?? []).length).toBeGreaterThan(4);
  });

  it("embeds the exact physical millimeter size in native SVG handoffs", () => {
    const project = createBeadProject({
      projectId: "native-svg-physical-size",
      moduleVersion: "1.0.0",
      now: "2026-08-02T00:00:00.000Z",
      rows: 2,
      columns: 3,
      palette: [[250, 20, 30]],
      cells: Array.from(
        { length: 6 },
        () => ({ kind: "color", paletteIndex: 0 }) as const,
      ),
      beadPitchMm: 2.6,
      compression: 50,
    });

    const svg = renderBeadProjectSvg(project);

    expect(svg).toContain('width="7.8mm"');
    expect(svg).toContain('height="5.2mm"');
    expect(svg).toContain('viewBox="0 0 3 2"');
  });

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
      irregularity: 42,
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
    const svg = new TextDecoder().decode(
      new Uint8Array(handoff.svgBytes),
    );
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
    expect(handoff.recommendedTotalThicknessMm).toBe(1.85);
    expect(handoff.recipeSource).toMatchObject({
      projectSchemaVersion: "bead-project/v1",
      renderSchemaVersion: "bead-render/v1",
      payload: { payloadVersion: "bead-recipe/v1" },
    });
    expect(handoff.recipeSource.payload).toMatchObject({
      irregularity: 42,
    });
    expect(svg).toContain('data-lumina-origin="workshop-handoff"');
    expect(svg).toContain('viewBox="0 0 1 1"');
    expect(svg).toContain('fill="rgb(250,20,30)"');
    expect((svg.match(/\bL /g) ?? []).length).toBeGreaterThanOrEqual(56);
    expect(svg).not.toContain("<image");
  });

  it("retries with only the PNG fallback for a legacy v1 host", async () => {
    const project = createBeadProject({
      projectId: "legacy-fallback",
      moduleVersion: "1.0.0",
      now: "2026-07-30T00:00:00.000Z",
      rows: 1,
      columns: 1,
      palette: [[10, 20, 30]],
      cells: [{ kind: "color", paletteIndex: 0 }],
      compression: 100,
    });
    const prepared = await prepareBeadHandoff(
      project,
      renderBeadProject(project, {
        compression: 100,
        pixelsPerCell: 32,
      }),
      pngCodec,
      null,
    );
    const image = vi
      .fn()
      .mockRejectedValueOnce({ code: "rpc-payload-invalid" })
      .mockResolvedValueOnce({ status: "completed" });

    await expect(
      handoffPreparedBeadImage({ handoff: { image } }, prepared),
    ).resolves.toEqual({ status: "completed" });

    expect(image).toHaveBeenCalledTimes(2);
    expect(image.mock.calls[0][0].svgBytes).toBeInstanceOf(ArrayBuffer);
    expect(image.mock.calls[0][0].recommendedTotalThicknessMm).toBe(1.85);
    expect(image.mock.calls[1][0].svgBytes).toBeUndefined();
    expect(
      image.mock.calls[1][0].recommendedTotalThicknessMm,
    ).toBeUndefined();
    expect(new Uint8Array(image.mock.calls[1][0].pngBytes).slice(0, 8))
      .toEqual(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  });
});
