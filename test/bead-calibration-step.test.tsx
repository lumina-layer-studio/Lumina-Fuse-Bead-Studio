import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BeadCalibrationStep,
  type BeadCalibrationDraft,
} from "../src/app/BeadCalibrationStep";
import type {
  PatternClassification,
  Raster,
} from "../src/domain/types";
import { translate } from "../src/i18n/translations";

const t = (key: string) => translate("zh-CN", key);

function raster(width = 40, height = 40): Raster {
  return {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
}

function initialDraft(
  overrides: Partial<BeadCalibrationDraft> = {},
): BeadCalibrationDraft {
  return {
    inputMode: "hard-pixel",
    rows: 4,
    columns: 4,
    geometry: {
      originX: 0,
      originY: 0,
      cellWidth: 10,
      cellHeight: 10,
    },
    orientation: {
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
    },
    emptySelection: null,
    transparentSupportSampleCellIndex: null,
    ...overrides,
  };
}

function Harness({
  draft = initialDraft(),
  onRecognize = vi.fn(),
  onReturnToEditor,
  busy = false,
  classificationBusy = false,
  classification,
}: {
  draft?: BeadCalibrationDraft;
  onRecognize?: () => void;
  onReturnToEditor?: () => void;
  busy?: boolean;
  classificationBusy?: boolean;
  classification?: PatternClassification | null;
}) {
  const [value, setValue] = useState(draft);
  return (
    <BeadCalibrationStep
      source={raster()}
      fileName="pattern.png"
      classification={
        classification === undefined
          ? {
              mode: "hard-pixel",
              confidence: 0.91,
              scores: {
                "numbered-grid": 0.1,
                "hard-pixel": 0.91,
                "ring-preview": 0.2,
              },
            }
          : classification
      }
      draft={value}
      busy={busy}
      classificationBusy={classificationBusy}
      translate={t}
      onChange={setValue}
      onRecognize={onRecognize}
      onOpenCrop={vi.fn()}
      onReturnToEditor={onReturnToEditor}
      canCrop
    />
  );
}

describe("BeadCalibrationStep", () => {
  beforeEach(() => {
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getContext",
    ).mockReturnValue(null);
  });

  it("requires an explicit empty-cell decision before recognition", () => {
    const onRecognize = vi.fn();
    render(<Harness onRecognize={onRecognize} />);

    const recognize = screen.getByRole("button", {
      name: "识别拼豆矩阵",
    });
    expect(recognize).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "图中没有空位" }),
    );
    expect(recognize).toBeEnabled();
    fireEvent.click(recognize);
    expect(onRecognize).toHaveBeenCalledTimes(1);
  });

  it("maps source-canvas picks to explicit empty and support samples", () => {
    render(<Harness />);
    const canvas = screen.getByRole("img", {
      name: "拼豆图纸网格校准",
    });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 400,
      width: 400,
      height: 400,
      toJSON: () => ({}),
    });

    fireEvent.click(
      screen.getByRole("button", { name: "选择一个空位" }),
    );
    fireEvent.pointerDown(canvas, {
      clientX: 250,
      clientY: 150,
    });
    expect(screen.getByText("空位样本：第 7 格")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "选择透明支撑" }),
    );
    fireEvent.pointerDown(canvas, {
      clientX: 150,
      clientY: 250,
    });
    expect(
      screen.getByText("透明支撑样本：第 10 格"),
    ).toBeInTheDocument();
  });

  it("updates orientation and rejects a visibly non-square grid", () => {
    render(
      <Harness
        draft={initialDraft({
          geometry: {
            originX: 0,
            originY: 0,
            cellWidth: 10,
            cellHeight: 7,
          },
        })}
      />,
    );

    expect(
      screen.getByText("当前网格不是正方形，请调整行列或原点。"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "识别拼豆矩阵" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "旋转 90°" }));
    expect(
      screen.getByRole("button", { name: "旋转 90°" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "水平翻转" }));
    expect(
      screen.getByRole("button", { name: "水平翻转" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("returns to the editor unless calibration is busy", () => {
    const onReturnToEditor = vi.fn();
    const { rerender } = render(
      <Harness onReturnToEditor={onReturnToEditor} />,
    );

    expect(
      screen.getByRole("button", { name: "裁剪图案" }),
    ).toBeInTheDocument();
    const returnButton = screen.getByRole("button", {
      name: "返回编辑器",
    });
    expect(returnButton).toBeEnabled();
    fireEvent.click(returnButton);
    expect(onReturnToEditor).toHaveBeenCalledTimes(1);

    rerender(
      <Harness busy onReturnToEditor={onReturnToEditor} />,
    );
    const busyReturnButton = screen.getByRole("button", {
      name: "返回编辑器",
    });
    expect(busyReturnButton).toBeDisabled();
    fireEvent.click(busyReturnButton);
    expect(onReturnToEditor).toHaveBeenCalledTimes(1);
  });

  it("allows classification cancellation but blocks crop and recognition until it settles", () => {
    const onReturnToEditor = vi.fn();
    render(
      <Harness
        classification={null}
        classificationBusy
        onReturnToEditor={onReturnToEditor}
      />,
    );

    expect(
      screen.getByText("正在分析图纸类型…"),
    ).toBeInTheDocument();
    const returnButton = screen.getByRole("button", {
      name: "返回编辑器",
    });
    expect(returnButton).toBeEnabled();
    fireEvent.click(returnButton);
    expect(onReturnToEditor).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "裁剪图案" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "识别拼豆矩阵" }),
    ).toBeDisabled();
  });

  it("distinguishes unavailable classification from recognition progress", () => {
    const { rerender } = render(
      <Harness classification={null} />,
    );

    expect(
      screen.getByText(
        "未能自动判断图纸类型，请手动确认。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("正在分析图纸类型…"),
    ).not.toBeInTheDocument();

    rerender(<Harness busy classification={null} />);
    expect(
      screen.getByText(
        "未能自动判断图纸类型，请手动确认。",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("正在分析图纸类型…"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "正在识别拼豆矩阵…",
      }),
    ).toBeDisabled();
  });
});
