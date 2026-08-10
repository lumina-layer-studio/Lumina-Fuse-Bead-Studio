import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BeadFusionPreview } from "../src/app/BeadFusionPreview";
import { createBeadProject } from "../src/domain/project";
import {
  buildBeadFusionPreviewSvg,
  renderBeadProjectSvg,
} from "../src/domain/svgRenderer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("BeadFusionPreview", () => {
  it("preserves native SVG colors while masking the same physical reliefs", () => {
    const project = createBeadProject({
      projectId: "preview-native-svg-parity",
      moduleVersion: "1.0.8",
      now: "2026-08-02T00:00:00.000Z",
      rows: 2,
      columns: 2,
      palette: [
        [230, 40, 50],
        [20, 120, 210],
      ],
      cells: [
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 1 },
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 1 },
      ],
      compression: 90,
      irregularity: 65,
    });

    render(
      <BeadFusionPreview
        project={project}
        ariaLabel="压合路径一致性"
      />,
    );

    const preview = screen.getByRole("img", {
      name: "压合路径一致性",
    });
    const previewPaths = [
      ...preview.querySelectorAll("[data-bead-fusion-path]"),
    ];
    const exported = new DOMParser().parseFromString(
      renderBeadProjectSvg(project),
      "image/svg+xml",
    );
    const exportedPaths = [...exported.querySelectorAll("path")];

    expect(previewPaths).toHaveLength(2);
    expect(
      previewPaths.map((path) => path.getAttribute("fill")),
    ).toEqual(exportedPaths.map((path) => path.getAttribute("fill")));
    expect(
      preview.querySelector("[data-bead-relief-mask]"),
    ).toBeInTheDocument();
    expect(
      preview.querySelector("[data-bead-relief-path]")?.getAttribute("d"),
    ).toContain(" A ");
    expect(previewPaths[0]?.getAttribute("stroke")).toBeNull();
  });

  it("overlaps terminal multi-color boundaries without changing the path geometry", () => {
    const project = createBeadProject({
      projectId: "preview-terminal-seam-overlap",
      moduleVersion: "1.0.8",
      now: "2026-08-02T00:00:00.000Z",
      rows: 1,
      columns: 2,
      palette: [
        [0, 0, 0],
        [250, 194, 208],
      ],
      cells: [
        { kind: "color", paletteIndex: 0 },
        { kind: "color", paletteIndex: 1 },
      ],
      compression: 100,
      irregularity: 44,
    });

    render(
      <BeadFusionPreview
        project={project}
        ariaLabel="终压多色无缝"
      />,
    );

    const preview = screen.getByRole("img", {
      name: "终压多色无缝",
    });
    const previewPaths = [
      ...preview.querySelectorAll("[data-bead-fusion-path]"),
    ];
    const exported = new DOMParser().parseFromString(
      renderBeadProjectSvg(project),
      "image/svg+xml",
    );
    const exportedPaths = [...exported.querySelectorAll("path")];

    for (const [index, path] of previewPaths.entries()) {
      expect(path.getAttribute("stroke")).toBe(path.getAttribute("fill"));
      expect(path.getAttribute("stroke-width")).toBe("0.02");
      expect(path.getAttribute("stroke-linejoin")).toBe("round");
      expect(path.getAttribute("paint-order")).toBe("stroke fill");
      expect(exportedPaths[index]?.getAttribute("stroke")).toBe(
        path.getAttribute("fill"),
      );
      expect(exportedPaths[index]?.getAttribute("stroke-width")).toBe(
        "0.02",
      );
    }
    expect(
      preview.querySelector("[data-bead-relief-mask]"),
    ).not.toBeInTheDocument();
  });

  it("renders only the latest asynchronous preview and stops superseded work", async () => {
    const firstProject = createBeadProject({
      projectId: "preview-worker-first",
      moduleVersion: "1.0.8",
      now: "2026-08-05T00:00:00.000Z",
      rows: 1,
      columns: 1,
      palette: [[230, 40, 50]],
      cells: [{ kind: "color", paletteIndex: 0 }],
      compression: 80,
      irregularity: 20,
    });
    const secondProject = {
      ...firstProject,
      projectId: "preview-worker-second",
      palette: [[20, 120, 210]] as [[number, number, number]],
      irregularity: 21,
    };
    const first = deferred<
      ReturnType<typeof buildBeadFusionPreviewSvg>
    >();
    const second = deferred<
      ReturnType<typeof buildBeadFusionPreviewSvg>
    >();
    const firstRenderer = {
      render: vi.fn(() => first.promise),
      dispose: vi.fn(),
    };
    const secondRenderer = {
      render: vi.fn(() => second.promise),
      dispose: vi.fn(),
    };
    const createPreviewRenderer = vi
      .fn()
      .mockReturnValueOnce(firstRenderer)
      .mockReturnValueOnce(secondRenderer);
    const view = render(
      <BeadFusionPreview
        project={firstProject}
        ariaLabel="异步压合预览"
        createPreviewRenderer={createPreviewRenderer}
      />,
    );

    expect(
      screen
        .getByRole("img", { name: "异步压合预览" })
        .querySelector("[data-bead-fusion-path]"),
    ).toBeNull();

    view.rerender(
      <BeadFusionPreview
        project={secondProject}
        ariaLabel="异步压合预览"
        createPreviewRenderer={createPreviewRenderer}
      />,
    );
    expect(firstRenderer.dispose).toHaveBeenCalledTimes(1);

    await act(async () => {
      second.resolve(buildBeadFusionPreviewSvg(secondProject));
      await second.promise;
    });
    await waitFor(() => {
      expect(
        screen
          .getByRole("img", { name: "异步压合预览" })
          .querySelector("[data-bead-fusion-path]")
          ?.getAttribute("fill"),
      ).toBe("rgb(20,120,210)");
    });

    await act(async () => {
      first.resolve(buildBeadFusionPreviewSvg(firstProject));
      await first.promise;
    });
    expect(
      screen
        .getByRole("img", { name: "异步压合预览" })
        .querySelector("[data-bead-fusion-path]")
        ?.getAttribute("fill"),
    ).toBe("rgb(20,120,210)");
    expect(secondRenderer.dispose).not.toHaveBeenCalled();

    view.unmount();
    expect(secondRenderer.dispose).toHaveBeenCalledTimes(1);
  });
});
