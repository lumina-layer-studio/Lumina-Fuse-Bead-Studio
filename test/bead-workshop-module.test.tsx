import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BeadWorkshopModule,
  type BeadImageCodec,
  type BeadProcessingEngine,
} from "../src/app/BeadWorkshopModule";
import { createBeadProject } from "../src/domain/project";
import { renderBeadProject } from "../src/domain/renderer";
import type {
  BeadProject,
  PatternClassification,
  Raster,
  RecognitionResult,
} from "../src/domain/types";
import type { WorkshopColorLibrary } from "@lumina/workshop-sdk";
import { createSdkHarness } from "./helpers/sdkHarness";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function sourceRaster(): Raster {
  const data = new Uint8ClampedArray(4 * 4 * 4);
  data.fill(255);
  return { width: 4, height: 4, data };
}

class FakeEngine implements BeadProcessingEngine {
  private nextId = 1;

  readonly dispose = vi.fn();

  cancelBefore(): void {}

  cancel(): void {}

  classify() {
    const result: PatternClassification = {
      mode: "hard-pixel",
      confidence: 0.94,
      scores: {
        "numbered-grid": 0.1,
        "hard-pixel": 0.94,
        "ring-preview": 0.1,
      },
    };
    return { id: this.nextId++, promise: Promise.resolve(result) };
  }

  recognize() {
    const result: RecognitionResult = {
      mode: "hard-pixel",
      rows: 2,
      columns: 2,
      palette: [
        [230, 40, 50],
        [20, 120, 210],
      ],
      cells: [
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 1 },
        { kind: "empty" },
        { kind: "transparent-support" },
      ],
      confidenceIssues: [],
    };
    return { id: this.nextId++, promise: Promise.resolve(result) };
  }

  render(
    project: BeadProject,
    compression: number,
    pixelsPerCell: number,
  ) {
    return {
      id: this.nextId++,
      promise: Promise.resolve(
        renderBeadProject(project, {
          compression,
          pixelsPerCell,
        }),
      ),
    };
  }
}

const codec: BeadImageCodec = {
  decode: vi.fn().mockResolvedValue(sourceRaster()),
  encodePng: vi.fn().mockResolvedValue(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer,
  ),
};

const RETRIED_LIBRARY: WorkshopColorLibrary = {
  id: "lut:aliz-ready",
  label: "Aliz RYBW",
  sourceKind: "lut",
  colors: [
    {
      id: "slot:red",
      label: "Red",
      hex: "#E3212A",
      materialId: null,
    },
  ],
};

describe("BeadWorkshopModule", () => {
  beforeEach(() => {
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getContext",
    ).mockReturnValue(null);
    vi.mocked(codec.decode).mockClear();
    vi.mocked(codec.encodePng).mockClear();
  });

  it("runs upload, calibration, recognition, editing, and autosave through SDK RPC", async () => {
    const raster = sourceRaster();
    const harness = createSdkHarness({
      pickedImage: {
        name: "pattern.png",
        mimeType: "image/png",
        bytes: new Uint8Array([1, 2, 3]).buffer,
        raster,
      },
    });
    const client = await harness.connect();
    render(
      <BeadWorkshopModule
        client={client}
        locale="zh-CN"
        createEngine={() => new FakeEngine()}
        imageCodec={codec}
        autosaveDelayMs={0}
      />,
    );

    expect(
      await screen.findByRole("button", { name: "选择拼豆图纸" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "选择拼豆图纸" }),
    );
    expect(
      await screen.findByRole("heading", { name: "校准图纸" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "图中没有空位" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "识别拼豆矩阵" }),
    );

    expect(
      await screen.findByRole("heading", { name: "编辑拼豆矩阵" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(harness.savedProjects().length).toBeGreaterThan(0);
    });
    const saved = harness.savedProjects().at(-1);
    expect(saved?.project).toMatchObject({
      rows: 2,
      columns: 2,
      compression: 50,
      source: {
        fileName: "pattern.png",
        mimeType: "image/png",
      },
    });
    expect(harness.methods()).toEqual(
      expect.arrayContaining([
        "project.latest",
        "image.pick",
        "project.save",
        "status.diagnostics",
      ]),
    );
    client.close();
    harness.close();
  });

  it("clears the host error when a failed image pick is retried successfully", async () => {
    const raster = sourceRaster();
    const harness = createSdkHarness();
    const client = await harness.connect();
    vi.spyOn(client.image, "pick")
      .mockRejectedValueOnce(new Error("decode failed"))
      .mockResolvedValueOnce({
        name: "pattern.png",
        mimeType: "image/png",
        bytes: new Uint8Array([1, 2, 3]).buffer,
        raster,
      });
    render(
      <BeadWorkshopModule
        client={client}
        locale="zh-CN"
        createEngine={() => new FakeEngine()}
        imageCodec={codec}
        autosaveDelayMs={0}
      />,
    );

    const pickImage = await screen.findByRole("button", {
      name: "选择拼豆图纸",
    });
    fireEvent.click(pickImage);
    expect(
      await screen.findByText(
        "无法读取这张图。请确认文件格式后重试。",
      ),
    ).toBeInTheDocument();
    expect(harness.payloads("status.error")).toContainEqual({
      code: "image-pick-failed",
      message: "无法读取这张图。请确认文件格式后重试。",
      retryable: true,
    });

    fireEvent.click(pickImage);
    expect(
      await screen.findByRole("heading", { name: "校准图纸" }),
    ).toBeInTheDocument();
    expect(harness.payloads("status.error").at(-1)).toBeNull();

    client.close();
    harness.close();
  });

  it("resumes a valid latest project and renders it before ready", async () => {
    const project = createBeadProject({
      projectId: "restored",
      moduleVersion: "1.0.0",
      now: "2026-07-30T00:00:00.000Z",
      rows: 2,
      columns: 2,
      palette: [[230, 40, 50]],
      cells: [
        { kind: "color", paletteIndex: 0 },
        { kind: "empty" },
        { kind: "empty" },
        { kind: "color", paletteIndex: 0 },
      ],
    });
    const harness = createSdkHarness({
      latestProject: {
        projectId: project.projectId,
        schemaVersion: project.schemaVersion,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        project,
      },
    });
    const client = await harness.connect();
    const engine = new FakeEngine();
    const view = render(
      <BeadWorkshopModule
        client={client}
        locale="zh-CN"
        createEngine={() => engine}
        imageCodec={codec}
        autosaveDelayMs={0}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "编辑拼豆矩阵" }),
    ).toBeInTheDocument();
    expect(screen.getByText("已恢复本机项目")).toBeInTheDocument();
    await waitFor(() => {
      expect(harness.methods()).toContain("lifecycle.ready");
    });
    expect(harness.indexOf("lifecycle.ready")).toBeGreaterThan(
      harness.indexOf("project.latest"),
    );

    view.unmount();
    expect(engine.dispose).toHaveBeenCalledTimes(1);
    harness.close();
  });

  it("lets the user reload the print library after a persistent miss", async () => {
    const project = createBeadProject({
      projectId: "library-manual-reload",
      moduleVersion: "1.0.0",
      now: "2026-07-30T00:00:00.000Z",
      rows: 1,
      columns: 1,
      palette: [[230, 40, 50]],
      cells: [{ kind: "color", paletteIndex: 0 }],
    });
    const harness = createSdkHarness({
      latestProject: {
        projectId: project.projectId,
        schemaVersion: project.schemaVersion,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        project,
      },
      colorLibraries: [null, RETRIED_LIBRARY],
    });
    const client = await harness.connect();
    render(
      <BeadWorkshopModule
        client={client}
        locale="zh-CN"
        createEngine={() => new FakeEngine()}
        imageCodec={codec}
        autosaveDelayMs={0}
      />,
    );

    await screen.findByText(
      "Lumina 当前没有可用的 LUT 或耗材档案，仍可使用图纸原色编辑。",
    );
    expect(
      harness.methods().filter(
        (method) => method === "colorLibrary.read",
      ),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "重新读取打印色库" }),
    );
    expect(
      await screen.findByText("当前色库：Aliz RYBW"),
    ).toBeInTheDocument();
    expect(
      harness.methods().filter(
        (method) => method === "colorLibrary.read",
      ),
    ).toHaveLength(2);

    client.close();
    harness.close();
  });

  it("keeps repeated manual reload clicks in one RPC flight", async () => {
    const project = createBeadProject({
      projectId: "library-single-flight",
      moduleVersion: "1.0.0",
      now: "2026-07-30T00:00:00.000Z",
      rows: 1,
      columns: 1,
      palette: [[230, 40, 50]],
      cells: [{ kind: "color", paletteIndex: 0 }],
    });
    const harness = createSdkHarness({
      latestProject: {
        projectId: project.projectId,
        schemaVersion: project.schemaVersion,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        project,
      },
    });
    const client = await harness.connect();
    const manualRead = deferred<WorkshopColorLibrary | null>();
    const read = vi
      .spyOn(client.colorLibrary, "read")
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => manualRead.promise);
    render(
      <BeadWorkshopModule
        client={client}
        locale="zh-CN"
        createEngine={() => new FakeEngine()}
        imageCodec={codec}
        autosaveDelayMs={0}
      />,
    );

    const reload = await screen.findByRole("button", {
      name: "重新读取打印色库",
    });
    await waitFor(() => expect(reload).toBeEnabled());
    fireEvent.click(reload);
    fireEvent.click(reload);
    expect(read).toHaveBeenCalledTimes(2);
    manualRead.resolve(RETRIED_LIBRARY);
    expect(
      await screen.findByText("当前色库：Aliz RYBW"),
    ).toBeInTheDocument();

    client.close();
    harness.close();
  });

  it("keeps source colors authoritative while explicitly mapping every library entry", async () => {
    const project = createBeadProject({
      projectId: "print-mapping",
      moduleVersion: "1.0.0",
      now: "2026-07-30T00:00:00.000Z",
      rows: 1,
      columns: 2,
      palette: [
        [250, 20, 30],
        [10, 220, 80],
      ],
      cells: [
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 1 },
      ],
    });
    const harness = createSdkHarness({
      latestProject: {
        projectId: project.projectId,
        schemaVersion: project.schemaVersion,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        project,
      },
      colorLibrary: {
        id: "material-archive:official",
        label: "官方 PLA",
        sourceKind: "material-archive",
        colors: [
          {
            id: "official-red",
            label: "官方红",
            hex: "#E3212A",
            materialId: "red-material",
          },
          {
            id: "community-red",
            label: "社区红",
            hex: "#E3212A",
            materialId: "community-red-material",
          },
          {
            id: "official-green",
            label: "官方绿",
            hex: "#25A55F",
            materialId: "green-material",
          },
        ],
      },
    });
    const client = await harness.connect();
    render(
      <BeadWorkshopModule
        client={client}
        locale="zh-CN"
        createEngine={() => new FakeEngine()}
        imageCodec={codec}
        autosaveDelayMs={0}
      />,
    );

    await screen.findByRole("heading", { name: "编辑拼豆矩阵" });
    const printPreview = screen.getByRole("button", {
      name: "当前打印色库",
    });
    expect(printPreview).toBeDisabled();
    expect(
      screen.getByText("当前色库：官方 PLA"),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "生成打印色映射" }),
    );
    await waitFor(() => expect(printPreview).toBeEnabled());
    expect(printPreview).toHaveAttribute("aria-pressed", "true");

    const firstColor = screen.getByRole("combobox", {
      name: "作品颜色 1",
    });
    expect(firstColor.querySelectorAll("option")).toHaveLength(3);
    fireEvent.change(firstColor, {
      target: { value: "community-red" },
    });
    await waitFor(() => {
      const saved = harness.savedProjects().at(-1)?.project as
        | BeadProject
        | undefined;
      expect(saved?.printMapping?.entries[0]).toEqual({
        sourcePaletteIndex: 0,
        colorEntryId: "community-red",
      });
    });
    const saved = harness.savedProjects().at(-1)
      ?.project as BeadProject;
    expect(saved.palette).toEqual(project.palette);

    client.close();
    harness.close();
  });

  it("sends exact PNG handoff bytes and retries only after confirmation", async () => {
    const harness = createSdkHarness({
      pickedImage: {
        name: "pattern.png",
        mimeType: "image/png",
        bytes: new Uint8Array([1, 2, 3]).buffer,
        raster: sourceRaster(),
      },
      handoffStatuses: ["needs-confirmation", "completed"],
    });
    const client = await harness.connect();
    render(
      <BeadWorkshopModule
        client={client}
        locale="zh-CN"
        createEngine={() => new FakeEngine()}
        imageCodec={codec}
        autosaveDelayMs={0}
      />,
    );

    await screen.findByRole("button", { name: "选择拼豆图纸" });
    fireEvent.click(
      screen.getByRole("button", { name: "选择拼豆图纸" }),
    );
    await screen.findByRole("heading", { name: "校准图纸" });
    fireEvent.click(
      screen.getByRole("button", { name: "图中没有空位" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "识别拼豆矩阵" }),
    );
    await screen.findByRole("heading", { name: "编辑拼豆矩阵" });

    fireEvent.click(
      screen.getByRole("button", { name: "交给 Lumina 转换" }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "确认交给 Lumina 转换？",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2 × 2 格 · 5.2 × 5.2 mm · 压合 50%"),
    ).toBeInTheDocument();
    expect(harness.payloads("handoff.image")).toHaveLength(0);

    fireEvent.click(
      screen.getByRole("button", { name: "继续交给 Lumina" }),
    );
    expect(
      await screen.findByRole("dialog", {
        name: "替换当前转换内容？",
      }),
    ).toBeInTheDocument();

    const first = harness.payloads("handoff.image")[0] as {
      pixelWidth: number;
      pixelHeight: number;
      recommendedWidthMm: number;
      recommendedHeightMm: number;
      layout: { rows: number; columns: number; pitchMm: number };
      preserveCanvasBounds: boolean;
    };
    expect(first).toMatchObject({
      pixelWidth: 64,
      pixelHeight: 64,
      recommendedWidthMm: 5.2,
      recommendedHeightMm: 5.2,
      layout: {
        kind: "square-grid",
        rows: 2,
        columns: 2,
        pitchMm: 2.6,
      },
      preserveCanvasBounds: true,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "替换并继续" }),
    );
    await waitFor(() => {
      expect(harness.payloads("handoff.image")).toHaveLength(2);
    });
    client.close();
    harness.close();
  });
});
