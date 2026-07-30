import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BeadProcessingEngine } from "../src/app/BeadWorkshopModule";
import { ModuleEntry } from "../src/app/ModuleEntry";
import { createBeadProject } from "../src/domain/project";
import { renderBeadProject } from "../src/domain/renderer";
import { createSdkHarness } from "./helpers/sdkHarness";

describe("Workshop SDK entry", () => {
  beforeEach(() => {
    vi.spyOn(
      HTMLCanvasElement.prototype,
      "getContext",
    ).mockReturnValue(null);
  });

  it("gets UI state, restores latest, and reports ready after usable render", async () => {
    const project = createBeadProject({
      projectId: "sdk-entry",
      moduleVersion: "1.0.0",
      now: "2026-07-30T00:00:00.000Z",
      rows: 1,
      columns: 1,
      palette: [[32, 120, 220]],
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
      uiState: {
        locale: "zh-CN",
        theme: "dark",
        tokens: {
          "--lumina-surface": "#111827",
          "--lumina-text": "#edf2f7",
        },
      },
    });

    let nextId = 1;
    const engine: BeadProcessingEngine = {
      classify: () => {
        throw new Error("not used");
      },
      recognize: () => {
        throw new Error("not used");
      },
      render: (value, compression, pixelsPerCell) => ({
        id: nextId++,
        promise: Promise.resolve(
          renderBeadProject(value, {
            compression,
            pixelsPerCell,
          }),
        ),
      }),
      cancelBefore: () => undefined,
      cancel: () => undefined,
      dispose: () => undefined,
    };

    render(
      <ModuleEntry
        connect={harness.connect}
        createEngine={() => engine}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "编辑拼豆矩阵" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(harness.methods()).toEqual(
        expect.arrayContaining([
          "ui.getState",
          "project.latest",
          "lifecycle.ready",
        ]),
      );
    });
    expect(harness.indexOf("lifecycle.ready")).toBeGreaterThan(
      harness.indexOf("project.latest"),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.lang).toBe("zh-CN");
    harness.close();
  });
});
