import { DEFAULT_BEAD_PITCH_MM } from "./types";

export const REFERENCE_NO_HOLE_THICKNESS_MM = 1.85;

const REFERENCE_THICKNESS_ANCHORS = [
  { compression: 0, thicknessMm: DEFAULT_BEAD_PITCH_MM },
  { compression: 50, thicknessMm: 2.35 },
  { compression: 90, thicknessMm: 1.95 },
  { compression: 100, thicknessMm: REFERENCE_NO_HOLE_THICKNESS_MM },
] as const;

function roundHundredth(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * Estimate finished bead-art thickness from the visual fusion setting.
 * 按压合预览档位估算拼豆成品总厚度。
 *
 * The 2.6 mm reference curve uses nominal raw-bead height at 0%, practical
 * intermediate estimates, and a 1.85 mm no-hole anchor at 100%. Other bead
 * sizes scale proportionally because pitch is the only physical bead-size
 * input currently stored by the project.
 *
 * 2.6 mm 基准曲线以原豆标称高度为 0%，中间档为实用估算，100% 无孔状态
 * 锚定 1.85 mm。当前项目只保存节距，因此其他豆子尺寸按比例缩放。
 */
export function estimateBeadThicknessMm(
  compression: number,
  beadPitchMm = DEFAULT_BEAD_PITCH_MM,
): number {
  if (
    !Number.isFinite(compression) ||
    compression < 0 ||
    compression > 100 ||
    !Number.isFinite(beadPitchMm) ||
    beadPitchMm <= 0
  ) {
    throw new RangeError("Bead compression and pitch must be physical values.");
  }

  const upperIndex = REFERENCE_THICKNESS_ANCHORS.findIndex(
    (anchor) => compression <= anchor.compression,
  );
  const upper = REFERENCE_THICKNESS_ANCHORS[
    Math.max(1, upperIndex)
  ];
  const lower = REFERENCE_THICKNESS_ANCHORS[
    Math.max(0, Math.max(1, upperIndex) - 1)
  ];
  const span = upper.compression - lower.compression;
  const progress = span === 0
    ? 0
    : (compression - lower.compression) / span;
  const referenceThickness =
    lower.thicknessMm +
    (upper.thicknessMm - lower.thicknessMm) * progress;

  return roundHundredth(
    referenceThickness * (beadPitchMm / DEFAULT_BEAD_PITCH_MM),
  );
}
