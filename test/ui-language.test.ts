import { describe, expect, it } from "vitest";

import { translate } from "../src/i18n/translations";

describe("bead workbench user language", () => {
  it("uses familiar Chinese making terms instead of internal geometry terms", () => {
    const expected = {
      "workshop.bead.editorTitle": "编辑豆子",
      "workshop.bead.editorDescription":
        "直接在图案上放豆、擦除或取色，再预览熨烫后的成品效果。",
      "workshop.bead.threeEditMode": "编辑豆子",
      "workshop.bead.threeViewMode": "调整视角",
      "workshop.bead.floating.edit": "放豆与修正",
      "workshop.bead.floating.inspector": "成品效果",
      "workshop.bead.floating.collapseEdit": "收起放豆工具",
      "workshop.bead.floating.expandInspector": "展开成品设置",
      "workshop.bead.toolsTitle": "放豆工具",
      "workshop.bead.tool.paint": "放豆",
      "workshop.bead.tool.erase": "擦除",
      "workshop.bead.tool.eraseFill": "清除连片",
      "workshop.bead.tool.eyedropper": "取色",
      "workshop.bead.tool.fill": "填充区域",
      "workshop.bead.view.matrix": "编辑豆子",
      "workshop.bead.view.pressure": "熨烫效果",
      "workshop.bead.view.three": "3D 成品",
      "workshop.bead.preview.source": "原图颜色",
      "workshop.bead.preview.print": "耗材颜色",
      "workshop.bead.printLibraryUnavailable":
        "尚未读取到耗材颜色，仍可使用原图颜色编辑。",
      "workshop.bead.reloadPrintLibrary": "重新读取耗材颜色",
      "workshop.bead.createPrintMapping": "匹配耗材颜色",
      "workshop.bead.printLibraryLabel": "当前耗材：{label}",
      "workshop.bead.printMappingTitle": "图案颜色 → 耗材颜色",
      "workshop.bead.matrixCanvas": "可编辑拼豆图案",
      "workshop.bead.pressureCanvas": "拼豆熨烫效果",
      "workshop.bead.threeCanvas": "可旋转的拼豆 3D 成品",
      "workshop.bead.threeFallbackCanvas":
        "拼豆二维熨烫效果（3D 安全降级）",
      "workshop.bead.threeRendering": "正在更新 3D 成品…",
      "workshop.bead.threeHint":
        "默认从正上方查看，方向和 2D 一致。选择“编辑豆子”后，左键或单指直接使用当前工具；选择“调整视角”后，拖动旋转，滚轮或双指缩放。桌面端也可用右键旋转、中键平移。",
      "workshop.bead.compression": "熨烫程度",
      "workshop.bead.pressureLight": "0 · 有孔",
      "workshop.bead.pressureStandard": "50 · 标准",
      "workshop.bead.pressureTight": "100 · 无孔",
      "workshop.bead.irregularity": "自然形变",
      "workshop.bead.beadPitch": "豆子间距",
      "workshop.bead.beadPitchHint":
        "默认 2.6 mm，表示相邻豆子中心间距，并决定最终打印尺寸。",
      "workshop.bead.physicalSize": "成品尺寸：{width} × {height} mm",
      "workshop.bead.rendering": "正在计算高分辨率熨烫效果…",
      "workshop.bead.handoff": "生成打印文件",
      "workshop.bead.handoffSummaryDescription":
        "下一步会把当前拼豆图案发送到 Lumina 图像转换，继续生成打印文件。将优先使用原图颜色，并附带耗材颜色映射。",
      "workshop.bead.handoffSummary":
        "{columns} × {rows} 格 · {width} × {height} × {thickness} mm · 熨烫 {compression}% · 自然形变 {irregularity}%",
    } as const;

    for (const [key, value] of Object.entries(expected)) {
      expect(translate("zh-CN", key)).toBe(value);
    }
  });

  it("uses matching plain English labels", () => {
    const expected = {
      "workshop.bead.editorTitle": "Edit beads",
      "workshop.bead.editorDescription":
        "Place, remove, or sample beads directly on the pattern, then preview the finished ironing result.",
      "workshop.bead.threeEditMode": "Edit beads",
      "workshop.bead.threeViewMode": "Adjust view",
      "workshop.bead.floating.edit": "Place & fix beads",
      "workshop.bead.floating.inspector": "Finished look",
      "workshop.bead.floating.collapseEdit": "Collapse bead tools",
      "workshop.bead.floating.expandInspector":
        "Expand finished-look settings",
      "workshop.bead.toolsTitle": "Bead tools",
      "workshop.bead.tool.paint": "Place beads",
      "workshop.bead.tool.erase": "Remove",
      "workshop.bead.tool.eraseFill": "Clear connected area",
      "workshop.bead.tool.eyedropper": "Pick color",
      "workshop.bead.tool.fill": "Fill area",
      "workshop.bead.view.matrix": "Edit beads",
      "workshop.bead.view.pressure": "Ironing result",
      "workshop.bead.view.three": "3D result",
      "workshop.bead.preview.source": "Original colors",
      "workshop.bead.preview.print": "Filament colors",
      "workshop.bead.printLibraryUnavailable":
        "No filament colors are available yet. You can keep editing with the original colors.",
      "workshop.bead.reloadPrintLibrary": "Reload filament colors",
      "workshop.bead.createPrintMapping": "Match filament colors",
      "workshop.bead.printLibraryLabel": "Current filaments: {label}",
      "workshop.bead.printMappingTitle": "Pattern colors → Filament colors",
      "workshop.bead.matrixCanvas": "Editable bead pattern",
      "workshop.bead.pressureCanvas": "Bead ironing result",
      "workshop.bead.threeCanvas": "Rotatable 3D bead result",
      "workshop.bead.threeFallbackCanvas":
        "2D bead ironing result (3D safety fallback)",
      "workshop.bead.threeRendering": "Updating 3D result…",
      "workshop.bead.threeHint":
        "The default view looks straight down and matches the 2D direction. Choose Edit beads to use the current tool with left click or one finger. Choose Adjust view to drag, rotate, and zoom with the wheel or two fingers. On desktop, right drag rotates and middle drag pans.",
      "workshop.bead.compression": "Ironing level",
      "workshop.bead.pressureLight": "0 · Open holes",
      "workshop.bead.pressureStandard": "50 · Standard",
      "workshop.bead.pressureTight": "100 · No holes",
      "workshop.bead.irregularity": "Natural variation",
      "workshop.bead.beadPitch": "Bead spacing",
      "workshop.bead.beadPitchHint":
        "The 2.6 mm default is the center-to-center bead spacing and determines the final print size.",
      "workshop.bead.physicalSize": "Finished size: {width} × {height} mm",
      "workshop.bead.rendering":
        "Rendering the high-resolution ironing result…",
      "workshop.bead.handoff": "Create print file",
      "workshop.bead.handoffSummaryDescription":
        "Next, this bead pattern will be sent to Lumina Image Conversion to continue creating the print file. Original colors stay authoritative, with filament color matches attached.",
      "workshop.bead.handoffSummary":
        "{columns} × {rows} cells · {width} × {height} × {thickness} mm · {compression}% ironing · {irregularity}% natural variation",
    } as const;

    for (const [key, value] of Object.entries(expected)) {
      expect(translate("en-US", key)).toBe(value);
    }
  });
});
