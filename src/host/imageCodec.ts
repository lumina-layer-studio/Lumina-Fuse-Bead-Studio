import type { BeadRenderResult } from "../domain/renderer";
import type { Raster } from "../domain/types";

export interface BeadImageCodec {
  decode(blob: Blob): Promise<Raster>;
  encodePng(raster: BeadRenderResult): Promise<ArrayBuffer>;
}

function canvasFor(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function decodeWithImageBitmap(blob: Blob): Promise<Raster> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = canvasFor(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });
    if (!context) throw new Error("2D canvas is unavailable.");
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(
      0,
      0,
      bitmap.width,
      bitmap.height,
    );
    return {
      width: bitmap.width,
      height: bitmap.height,
      data: new Uint8ClampedArray(image.data),
    };
  } finally {
    bitmap.close();
  }
}

function decodeWithImage(blob: Blob): Promise<Raster> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = canvasFor(
          image.naturalWidth,
          image.naturalHeight,
        );
        const context = canvas.getContext("2d", {
          willReadFrequently: true,
        });
        if (!context) throw new Error("2D canvas is unavailable.");
        context.drawImage(image, 0, 0);
        const decoded = context.getImageData(
          0,
          0,
          image.naturalWidth,
          image.naturalHeight,
        );
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight,
          data: new Uint8ClampedArray(decoded.data),
        });
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected image could not be decoded."));
    };
    image.src = url;
  });
}

async function decode(blob: Blob): Promise<Raster> {
  return typeof createImageBitmap === "function"
    ? decodeWithImageBitmap(blob)
    : decodeWithImage(blob);
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("The bead canvas could not be encoded."));
          return;
        }
        void blob.arrayBuffer().then(resolve, reject);
      },
      "image/png",
    );
  });
}

async function encodePng(
  raster: BeadRenderResult,
): Promise<ArrayBuffer> {
  const canvas = canvasFor(raster.width, raster.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is unavailable.");
  const image = context.createImageData(raster.width, raster.height);
  image.data.set(raster.data);
  context.putImageData(image, 0, 0);
  return canvasToPng(canvas);
}

export const browserBeadImageCodec: BeadImageCodec = {
  decode,
  encodePng,
};
