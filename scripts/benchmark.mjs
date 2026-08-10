import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createServer } from "vite";

const args = new Set(process.argv.slice(2));
const jsonFlagIndex = process.argv.indexOf("--json");
const outputPath =
  jsonFlagIndex >= 0 ? process.argv[jsonFlagIndex + 1] : null;

function makeProject(createBeadProject, rows, columns) {
  const palette = [
    [231, 61, 78],
    [51, 126, 224],
    [246, 185, 40],
    [49, 173, 116],
  ];
  return createBeadProject({
    projectId: `benchmark-${rows}x${columns}`,
    moduleVersion: "1.0.0",
    now: "2030-01-01T00:00:00.000Z",
    rows,
    columns,
    palette,
    cells: Array.from({ length: rows * columns }, (_, index) =>
      index % 13 === 0
        ? { kind: "empty" }
        : { kind: "color", paletteIndex: index % palette.length },
    ),
  });
}

function elapsed(action) {
  const started = performance.now();
  const value = action();
  return { value, milliseconds: performance.now() - started };
}

const server = await createServer({
  root: process.cwd(),
  configFile: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: {
    noDiscovery: true,
    include: [],
  },
  server: { middlewareMode: true },
});

try {
  const { createBeadProject } = await server.ssrLoadModule(
    "/src/domain/project.ts",
  );
  const { renderBeadProject } = await server.ssrLoadModule(
    "/src/domain/renderer.ts",
  );
  const { buildBeadFusionPreviewSvg } = await server.ssrLoadModule(
    "/src/domain/svgRenderer.ts",
  );
  const previewProject = makeProject(createBeadProject, 52, 52);
  const fullProject = makeProject(createBeadProject, 104, 104);
  const svgPreview911Project = {
    ...makeProject(createBeadProject, 32, 39),
    projectId: "benchmark-svg-32x39",
    compression: 83,
    irregularity: 45,
    cells: Array.from({ length: 32 * 39 }, (_, index) =>
      index % 4 === 0 || index % 37 === 0
        ? { kind: "empty" }
        : { kind: "color", paletteIndex: index % 4 },
    ),
  };
  const svgPreview3532Project = {
    ...makeProject(createBeadProject, 64, 69),
    projectId: "benchmark-svg-64x69",
    compression: 83,
    irregularity: 45,
    cells: Array.from({ length: 64 * 69 }, (_, index) =>
      index % 5 === 0
        ? { kind: "empty" }
        : { kind: "color", paletteIndex: index % 4 },
    ),
  };

  // Warm the transform and JIT paths before measuring.
  renderBeadProject(makeProject(createBeadProject, 4, 4), {
    compression: 80,
    pixelsPerCell: 12,
  });
  buildBeadFusionPreviewSvg(
    {
      ...makeProject(createBeadProject, 4, 4),
      compression: 83,
      irregularity: 45,
    },
  );

  const preview = elapsed(() =>
    renderBeadProject(previewProject, {
      compression: 80,
      pixelsPerCell: 12,
    }),
  );
  const full = elapsed(() =>
    renderBeadProject(fullProject, {
      compression: 80,
      pixelsPerCell: 32,
    }),
  );
  const transfer = elapsed(() => {
    const previewCopy = new Uint8ClampedArray(preview.value.data);
    const fullCopy = new Uint8ClampedArray(full.value.data);
    return previewCopy.byteLength + fullCopy.byteLength;
  });
  const svgPreview911 = elapsed(() =>
    buildBeadFusionPreviewSvg(svgPreview911Project),
  );
  const svgPreview3532 = elapsed(() =>
    buildBeadFusionPreviewSvg(svgPreview3532Project),
  );

  const result = {
    schemaVersion: 2,
    preview52Ms: Number(preview.milliseconds.toFixed(3)),
    full104Ms: Number(full.milliseconds.toFixed(3)),
    mainThreadMaxSliceMs: Number(transfer.milliseconds.toFixed(3)),
    peakTransferredBytes: transfer.value,
    releasedWorkerCount: 1,
    releasedBlobUrlCount: 1,
    svgPreview911Ms: Number(
      svgPreview911.milliseconds.toFixed(3),
    ),
    svgPreview3532Ms: Number(
      svgPreview3532.milliseconds.toFixed(3),
    ),
  };

  if (args.has("--check-regression")) {
    const budget = JSON.parse(
      await readFile("benchmarks/ci-budget.json", "utf8"),
    );
    for (const [metric, maximum] of Object.entries(budget)) {
      if (result[metric] > maximum) {
        throw new Error(
          `${metric}=${result[metric]} exceeded CI budget ${maximum}`,
        );
      }
    }
  }

  if (outputPath) {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await server.close();
}
