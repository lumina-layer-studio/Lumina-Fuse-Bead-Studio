import type {
  WorkshopClient,
  WorkshopPickedImage,
  WorkshopProjectRecord,
} from "@lumina/workshop-sdk";

import {
  validateBeadProject,
} from "../domain/project";
import type {
  BeadProject,
  BeadProjectSource,
  Raster,
} from "../domain/types";

interface StoredBeadProjectSource {
  fileName: string;
  mimeType: string;
  bytes: ArrayBuffer;
  pixelWidth: number;
  pixelHeight: number;
}

type StoredBeadProject = Omit<BeadProject, "source"> & {
  source: StoredBeadProjectSource | null;
};

export interface PickedBeadSource {
  source: BeadProjectSource;
  raster: Raster;
}

const sourceBytes = new WeakMap<Blob, Promise<ArrayBuffer>>();

function bytesForBlob(blob: Blob): Promise<ArrayBuffer> {
  const existing = sourceBytes.get(blob);
  if (existing) return existing;
  const pending = blob.arrayBuffer();
  sourceBytes.set(blob, pending);
  return pending;
}

function sourceFromPickedImage(
  picked: WorkshopPickedImage,
): BeadProjectSource {
  const bytes = picked.bytes.slice(0);
  const blob = new Blob([bytes], { type: picked.mimeType });
  sourceBytes.set(blob, Promise.resolve(bytes.slice(0)));
  return {
    fileName: picked.name,
    mimeType: picked.mimeType,
    blob,
    pixelWidth: picked.raster.width,
    pixelHeight: picked.raster.height,
  };
}

export async function pickBeadSource(
  client: WorkshopClient,
): Promise<PickedBeadSource | null> {
  const picked = await client.image.pick();
  if (!picked) return null;
  return {
    source: sourceFromPickedImage(picked),
    raster: {
      width: picked.raster.width,
      height: picked.raster.height,
      data: new Uint8ClampedArray(picked.raster.data),
    },
  };
}

async function projectForStorage(
  project: BeadProject,
): Promise<StoredBeadProject> {
  const source = project.source;
  const { printMapping, ...projectWithoutPrintMapping } = project;
  return {
    ...projectWithoutPrintMapping,
    palette: project.palette.map((color) => [...color]),
    cells: project.cells.map((cell) => ({ ...cell })),
    confidenceIssues: project.confidenceIssues.map((issue) => ({
      ...issue,
      reasons: [...issue.reasons],
    })),
    calibration: {
      ...project.calibration,
      crop: project.calibration.crop
        ? { ...project.calibration.crop }
        : null,
      origin: { ...project.calibration.origin },
      orientation: { ...project.calibration.orientation },
      emptySelection: { ...project.calibration.emptySelection },
    },
    source: source
      ? {
          fileName: source.fileName,
          mimeType: source.mimeType,
          bytes: (await bytesForBlob(source.blob)).slice(0),
          pixelWidth: source.pixelWidth,
          pixelHeight: source.pixelHeight,
        }
      : null,
    ...(printMapping !== undefined
      ? {
          printMapping: printMapping
            ? {
                ...printMapping,
                entries: printMapping.entries.map((entry) => ({
                  ...entry,
                })),
              }
            : null,
        }
      : {}),
  } as StoredBeadProject;
}

function projectFromStorage(
  project: StoredBeadProject,
): BeadProject {
  const source = project.source;
  const restoredSource = source
    ? {
        fileName: source.fileName,
        mimeType: source.mimeType,
        blob: new Blob([source.bytes], { type: source.mimeType }),
        pixelWidth: source.pixelWidth,
        pixelHeight: source.pixelHeight,
      }
    : null;
  if (source && restoredSource) {
    sourceBytes.set(
      restoredSource.blob,
      Promise.resolve(source.bytes.slice(0)),
    );
  }
  return validateBeadProject({
    ...project,
    source: restoredSource,
  });
}

export async function saveBeadProject(
  client: WorkshopClient,
  project: BeadProject,
): Promise<void> {
  const stored = await projectForStorage(project);
  const record: WorkshopProjectRecord<StoredBeadProject> = {
    projectId: project.projectId,
    schemaVersion: project.schemaVersion,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    project: stored,
  };
  await client.projects.save(record);
}

export async function latestBeadProject(
  client: WorkshopClient,
): Promise<BeadProject | null> {
  const record =
    await client.projects.latest<StoredBeadProject>();
  return record ? projectFromStorage(record.project) : null;
}

export async function loadBeadProject(
  client: WorkshopClient,
  projectId: string,
): Promise<BeadProject | null> {
  const record =
    await client.projects.load<StoredBeadProject>(projectId);
  return record ? projectFromStorage(record.project) : null;
}
