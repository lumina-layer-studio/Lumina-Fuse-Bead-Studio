import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { JSDOM } from "jsdom";
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

function geometryBytes(geometry) {
  const attributeBytes = Object.values(geometry.attributes).reduce(
    (total, attribute) => total + attribute.array.byteLength,
    0,
  );
  return attributeBytes + (geometry.index?.array.byteLength ?? 0);
}

const benchmarkDom = new JSDOM();
globalThis.DOMParser = benchmarkDom.window.DOMParser;

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
  const {
    buildBeadFusionPreviewSvg,
    buildBeadFusionSurfacePaths,
  } = await server.ssrLoadModule(
    "/src/domain/svgRenderer.ts",
  );
  const { buildPhysicalPreviewModel } = await server.ssrLoadModule(
    "/src/domain/physicalPreviewModel.ts",
  );
  const { buildBeadPreviewSurfaceGeometry } = await server.ssrLoadModule(
    "/src/app/beadThreePreviewController.ts",
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
  const physicalPreview16384Project = makeProject(
    createBeadProject,
    128,
    128,
  );

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
  buildBeadFusionSurfacePaths({
    ...makeProject(createBeadProject, 4, 4),
    compression: 83,
    irregularity: 45,
  });
  buildPhysicalPreviewModel(svgPreview3532Project, []);
  buildPhysicalPreviewModel(physicalPreview16384Project, []);

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
  const fusionSurface911 = elapsed(() =>
    buildBeadFusionSurfacePaths(svgPreview911Project),
  );
  const fusionSurface3532 = elapsed(() =>
    buildBeadFusionSurfacePaths(svgPreview3532Project),
  );
  const physicalPreview3532 = elapsed(() =>
    buildPhysicalPreviewModel(
      svgPreview3532Project,
      fusionSurface3532.value,
    ),
  );
  const physicalPreview16384 = elapsed(() =>
    buildPhysicalPreviewModel(physicalPreview16384Project, []),
  );
  const threeGeometry3532 = elapsed(() =>
    physicalPreview3532.value.surfacePaths.flatMap((surfacePath) => {
      const geometry = buildBeadPreviewSurfaceGeometry(
        physicalPreview3532.value,
        surfacePath.d,
      );
      return geometry === null ? [] : [geometry];
    }),
  );
  const threeGeometry3532Bytes = threeGeometry3532.value.reduce(
    (total, geometry) => total + geometryBytes(geometry),
    0,
  );
  for (const geometry of threeGeometry3532.value) geometry.dispose();

  const result = {
    schemaVersion: 5,
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
    fusionSurface911Ms: Number(
      fusionSurface911.milliseconds.toFixed(3),
    ),
    fusionSurface3532Ms: Number(
      fusionSurface3532.milliseconds.toFixed(3),
    ),
    threeGeometry3532Ms: Number(
      threeGeometry3532.milliseconds.toFixed(3),
    ),
    threeGeometry3532Bytes,
    physicalPreview3532Ms: Number(
      physicalPreview3532.milliseconds.toFixed(3),
    ),
    physicalPreview16384Ms: Number(
      physicalPreview16384.milliseconds.toFixed(3),
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
  benchmarkDom.window.close();
}
