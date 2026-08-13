import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";

const outputIndex = process.argv.indexOf("--output");
const outputDirectory =
  outputIndex >= 0 && process.argv[outputIndex + 1]
    ? path.resolve(process.argv[outputIndex + 1])
    : path.resolve("artifacts", "acceptance-fixtures");

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const body = Buffer.from(data);
  const output = Buffer.alloc(12 + body.length);
  output.writeUInt32BE(body.length, 0);
  typeBytes.copy(output, 4);
  body.copy(output, 8);
  output.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, body])),
    8 + body.length,
  );
  return output;
}

function encodePng(raster) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(raster.width, 0);
  header.writeUInt32BE(raster.height, 4);
  header[8] = 8;
  header[9] = 6;

  const stride = raster.width * 4;
  const scanlines = Buffer.alloc((stride + 1) * raster.height);
  for (let row = 0; row < raster.height; row += 1) {
    const targetOffset = row * (stride + 1);
    scanlines[targetOffset] = 0;
    Buffer.from(
      raster.data.buffer,
      raster.data.byteOffset + row * stride,
      stride,
    ).copy(scanlines, targetOffset + 1);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(scanlines, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
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
  const {
    makeGeneratedHardPixelChart,
    makeGeneratedRingChart,
    makeLabeledNumberedChart,
  } = await server.ssrLoadModule("/test/helpers/chartFixtures.ts");
  const fixtures = [
    [
      "numbered-grid-17x23.png",
      makeLabeledNumberedChart(17, 23).raster,
    ],
    [
      "hard-pixel-17x23.png",
      makeGeneratedHardPixelChart(17, 23, 16),
    ],
    [
      "ring-preview-17x23.png",
      makeGeneratedRingChart(17, 23),
    ],
  ];

  await mkdir(outputDirectory, { recursive: true });
  for (const [name, raster] of fixtures) {
    await writeFile(path.join(outputDirectory, name), encodePng(raster));
  }
  process.stdout.write(`${outputDirectory}\n`);
} finally {
  await server.close();
}
