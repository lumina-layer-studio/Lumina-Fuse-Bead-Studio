const zhCN = {
  "app.name": "拼豆工作台",
  "app.description": "把清晰拼豆图纸识别为可编辑矩阵，再生成可调压合预览。",
  "workshop.bead.name": "拼豆模式",
  "workshop.bead.description":
    "读取清晰拼豆图纸或截图，校准格子并生成可继续编辑的拼豆矩阵。",
  "workshop.bead.intro":
    "上传编号格图、硬边像素图或数字圆豆俯视图。下一步会让你确认网格和空格，不会自动猜测倾斜实拍。",
  "workshop.bead.choosePattern": "选择拼豆图纸",
  "workshop.bead.supportedInputs":
    "支持 PNG、JPEG、WebP；请选择单个清晰、正视的图案。",
  "workshop.bead.localPrivacy": "分析和项目保存都在本机完成。",
  "workshop.bead.selectedFile": "已选择：{filename}",
  "workshop.bead.pickerError": "无法读取这张图。请确认文件格式后重试。",
  "workshop.bead.loadingProject": "正在读取本机项目…",
  "workshop.bead.resumeReady": "已恢复本机项目",
  "workshop.bead.calibrationTitle": "校准图纸",
  "workshop.bead.calibrationDescription":
    "确认图纸类型、正方形网格和空位样本。识别只读取你确认的格子。",
  "workshop.bead.cropPattern": "裁剪图案",
  "workshop.bead.inputMode": "图纸类型",
  "workshop.bead.mode.numbered-grid": "编号网格图",
  "workshop.bead.mode.hard-pixel": "硬边像素图",
  "workshop.bead.mode.ring-preview": "圆豆俯视图",
  "workshop.bead.mode.ambiguous": "需要手动确认",
  "workshop.bead.classification": "建议：{mode} · 置信度 {confidence}%",
  "workshop.bead.classifying": "正在分析图纸类型…",
  "workshop.bead.rows": "行数",
  "workshop.bead.columns": "列数",
  "workshop.bead.originX": "网格原点 X",
  "workshop.bead.originY": "网格原点 Y",
  "workshop.bead.gridInvalid": "当前网格不是正方形，请调整行列或原点。",
  "workshop.bead.emptyDecisionRequired":
    "请先选择一个空位样本，或明确图中没有空位。",
  "workshop.bead.pickEmpty": "选择一个空位",
  "workshop.bead.noEmpty": "图中没有空位",
  "workshop.bead.pickSupport": "选择透明支撑",
  "workshop.bead.clearSupport": "清除透明支撑样本",
  "workshop.bead.emptySample": "空位样本：第 {index} 格",
  "workshop.bead.noEmptySelected": "已确认：图中没有空位",
  "workshop.bead.supportSample": "透明支撑样本：第 {index} 格",
  "workshop.bead.rotate0": "旋转 0°",
  "workshop.bead.rotate90": "旋转 90°",
  "workshop.bead.rotate180": "旋转 180°",
  "workshop.bead.rotate270": "旋转 270°",
  "workshop.bead.flipHorizontal": "水平翻转",
  "workshop.bead.flipVertical": "垂直翻转",
  "workshop.bead.recognize": "识别拼豆矩阵",
  "workshop.bead.recognizing": "正在识别拼豆矩阵…",
  "workshop.bead.calibrationCanvas": "拼豆图纸网格校准",
  "workshop.bead.editorTitle": "编辑拼豆矩阵",
  "workshop.bead.editorDescription":
    "修正识别结果，再调节压合程度。透明支撑参与挤压，但不会进入最终图像颜色。",
  "workshop.bead.tool.paint": "画笔",
  "workshop.bead.tool.erase": "橡皮",
  "workshop.bead.tool.eyedropper": "吸管",
  "workshop.bead.tool.fill": "填充",
  "workshop.bead.tool.support": "透明支撑",
  "workshop.bead.undo": "撤销",
  "workshop.bead.redo": "重做",
  "workshop.bead.previousIssue": "上一个待复核格",
  "workshop.bead.nextIssue": "下一个待复核格",
  "workshop.bead.reviewSummary": "待复核 {pending} / 共 {total}",
  "workshop.bead.view.original": "原图",
  "workshop.bead.view.matrix": "识别矩阵",
  "workshop.bead.view.pressure": "压合预览",
  "workshop.bead.preview.source": "图纸原色",
  "workshop.bead.preview.print": "当前打印色库",
  "workshop.bead.printLibraryUnavailable":
    "Lumina 当前没有可用的 LUT 或耗材档案，仍可使用图纸原色编辑。",
  "workshop.bead.reloadPrintLibrary": "重新读取打印色库",
  "workshop.bead.printMappingRequired":
    "先生成一次打印色映射，再预览当前色库。",
  "workshop.bead.printMappingStale":
    "Lumina 的当前色库已经变化；旧映射不会被静默替换。",
  "workshop.bead.createPrintMapping": "生成打印色映射",
  "workshop.bead.refreshPrintMapping": "按当前色库重新映射",
  "workshop.bead.printMappingTitle": "作品用色 → Lumina 可打印色",
  "workshop.bead.printColorFor": "作品颜色 {index}",
  "workshop.bead.printLibraryLabel": "当前色库：{label}",
  "workshop.bead.matrixCanvas": "可编辑拼豆矩阵",
  "workshop.bead.pressureCanvas": "拼豆压合预览",
  "workshop.bead.originalCanvas": "拼豆图纸原图",
  "workshop.bead.magnifier": "选中格局部放大",
  "workshop.bead.showGrid": "显示网格",
  "workshop.bead.paletteColor": "颜色 {index}",
  "workshop.bead.customColor": "添加自定义颜色",
  "workshop.bead.compression": "压合程度",
  "workshop.bead.compressionHint":
    "0 保留中心孔和豆间缝，50 保留细小十字或菱形凹点，100 完全压紧闭合。",
  "workshop.bead.pressureLight": "0 · 轻压有孔",
  "workshop.bead.pressureStandard": "50 · 标准",
  "workshop.bead.pressureTight": "100 · 紧压无孔",
  "workshop.bead.beadPitch": "单豆节距",
  "workshop.bead.beadPitchHint":
    "默认 2.6 mm，表示相邻豆子中心间距，并决定交给 Lumina 的真实画布尺寸。",
  "workshop.bead.physicalSize": "{width} × {height} mm",
  "workshop.bead.rendering": "正在计算高分辨率压合预览…",
  "workshop.bead.newProject": "新建图纸",
  "workshop.bead.handoff": "交给 Lumina 转换",
  "workshop.bead.handoffEmpty": "至少保留一颗有颜色的拼豆后才能转换",
  "workshop.bead.handoffSummaryTitle": "确认交给 Lumina 转换？",
  "workshop.bead.handoffSummaryDescription":
    "将发送作品原色 PNG；当前打印色库只作为映射来源记录，不会替换图纸颜色。",
  "workshop.bead.handoffSummary":
    "{columns} × {rows} 格 · {width} × {height} mm · 压合 {compression}%",
  "workshop.bead.handoffLibrary": "映射来源：{label}",
  "workshop.bead.handoffNoLibrary": "未绑定打印色库",
  "workshop.bead.handoffSummaryCancel": "返回编辑",
  "workshop.bead.handoffSummaryConfirm": "继续交给 Lumina",
  "workshop.bead.replaceTitle": "替换当前转换内容？",
  "workshop.bead.replaceDescription":
    "转换器里已有图片或批量任务。继续会用当前拼豆画布替换它，但不会删除已自动保存的拼豆项目。",
  "workshop.bead.replaceCancel": "暂不替换",
  "workshop.bead.replaceConfirm": "替换并继续",
  "workshop.bead.handoffError":
    "无法把当前拼豆画布交给转换器，请检查图案后重试。",
  "workshop.bead.processingError":
    "本地图像处理失败。项目仍在本机，请重试当前步骤。",
  "workshop.bead.saveError":
    "自动保存暂时失败。当前页面中的编辑不会丢失。",
  "crop.title": "裁剪图案",
  "crop.description":
    "在预览图上拖拽选择要保留的区域；下方数值可用于精确调整。",
  "crop.previewAria": "拖拽选择要保留的图案区域",
  "crop.x": "左边距",
  "crop.y": "上边距",
  "crop.width": "宽度",
  "crop.height": "高度",
  "crop.cancel": "取消",
  "crop.original": "使用原图",
  "crop.confirm": "应用裁剪",
} as const;

const enUS = {
  "app.name": "Fuse Bead Studio",
  "app.description":
    "Recognize a clear bead chart as an editable matrix and render adjustable fusion.",
  "workshop.bead.name": "Bead Pattern",
  "workshop.bead.description":
    "Read a clear bead chart or screenshot, calibrate its grid, and create an editable bead matrix.",
  "workshop.bead.intro":
    "Upload a numbered grid, hard-edged pixel chart, or digital top-down ring preview. You will confirm the grid and empty cells; oblique photos are not guessed.",
  "workshop.bead.choosePattern": "Choose bead pattern",
  "workshop.bead.supportedInputs":
    "PNG, JPEG, and WebP are supported. Choose one clear, front-facing pattern.",
  "workshop.bead.localPrivacy":
    "Analysis and project storage stay on this device.",
  "workshop.bead.selectedFile": "Selected: {filename}",
  "workshop.bead.pickerError":
    "This image could not be read. Check its format and try again.",
  "workshop.bead.loadingProject": "Loading the local project…",
  "workshop.bead.resumeReady": "Local project restored",
  "workshop.bead.calibrationTitle": "Calibrate pattern",
  "workshop.bead.calibrationDescription":
    "Confirm the pattern type, square grid, and empty-cell sample. Recognition reads only the cells you confirm.",
  "workshop.bead.cropPattern": "Crop pattern",
  "workshop.bead.inputMode": "Pattern type",
  "workshop.bead.mode.numbered-grid": "Numbered grid",
  "workshop.bead.mode.hard-pixel": "Hard-edged pixel chart",
  "workshop.bead.mode.ring-preview": "Top-down ring preview",
  "workshop.bead.mode.ambiguous": "Needs manual confirmation",
  "workshop.bead.classification": "Suggested: {mode} · {confidence}% confidence",
  "workshop.bead.classifying": "Analyzing the pattern type…",
  "workshop.bead.rows": "Rows",
  "workshop.bead.columns": "Columns",
  "workshop.bead.originX": "Grid origin X",
  "workshop.bead.originY": "Grid origin Y",
  "workshop.bead.gridInvalid":
    "The current grid is not square. Adjust rows, columns, or the origin.",
  "workshop.bead.emptyDecisionRequired":
    "Choose an empty-cell sample or explicitly confirm that the pattern has no empty cells.",
  "workshop.bead.pickEmpty": "Choose an empty cell",
  "workshop.bead.noEmpty": "No empty cells",
  "workshop.bead.pickSupport": "Choose transparent support",
  "workshop.bead.clearSupport": "Clear support sample",
  "workshop.bead.emptySample": "Empty sample: cell {index}",
  "workshop.bead.noEmptySelected": "Confirmed: no empty cells",
  "workshop.bead.supportSample": "Transparent support sample: cell {index}",
  "workshop.bead.rotate0": "Rotate 0°",
  "workshop.bead.rotate90": "Rotate 90°",
  "workshop.bead.rotate180": "Rotate 180°",
  "workshop.bead.rotate270": "Rotate 270°",
  "workshop.bead.flipHorizontal": "Flip horizontally",
  "workshop.bead.flipVertical": "Flip vertically",
  "workshop.bead.recognize": "Recognize bead matrix",
  "workshop.bead.recognizing": "Recognizing bead matrix…",
  "workshop.bead.calibrationCanvas": "Bead pattern grid calibration",
  "workshop.bead.editorTitle": "Edit bead matrix",
  "workshop.bead.editorDescription":
    "Correct the recognized matrix, then adjust pressure. Transparent support affects contact geometry but adds no output color.",
  "workshop.bead.tool.paint": "Paint",
  "workshop.bead.tool.erase": "Erase",
  "workshop.bead.tool.eyedropper": "Eyedropper",
  "workshop.bead.tool.fill": "Fill",
  "workshop.bead.tool.support": "Transparent support",
  "workshop.bead.undo": "Undo",
  "workshop.bead.redo": "Redo",
  "workshop.bead.previousIssue": "Previous review cell",
  "workshop.bead.nextIssue": "Next review cell",
  "workshop.bead.reviewSummary": "{pending} pending / {total} total",
  "workshop.bead.view.original": "Original",
  "workshop.bead.view.matrix": "Matrix",
  "workshop.bead.view.pressure": "Pressure preview",
  "workshop.bead.preview.source": "Source colors",
  "workshop.bead.preview.print": "Current print library",
  "workshop.bead.printLibraryUnavailable":
    "Lumina has no current LUT or material archive. You can keep editing with source colors.",
  "workshop.bead.reloadPrintLibrary": "Reload print library",
  "workshop.bead.printMappingRequired":
    "Create a print-color mapping before previewing the current library.",
  "workshop.bead.printMappingStale":
    "Lumina's current library changed. The old mapping will not be silently replaced.",
  "workshop.bead.createPrintMapping": "Create print mapping",
  "workshop.bead.refreshPrintMapping": "Remap to current library",
  "workshop.bead.printMappingTitle":
    "Artwork colors → Lumina printable colors",
  "workshop.bead.printColorFor": "Artwork color {index}",
  "workshop.bead.printLibraryLabel": "Current library: {label}",
  "workshop.bead.matrixCanvas": "Editable bead matrix",
  "workshop.bead.pressureCanvas": "Bead pressure preview",
  "workshop.bead.originalCanvas": "Original bead pattern",
  "workshop.bead.magnifier": "Selected-cell magnifier",
  "workshop.bead.showGrid": "Show grid",
  "workshop.bead.paletteColor": "Color {index}",
  "workshop.bead.customColor": "Add custom color",
  "workshop.bead.compression": "Pressure",
  "workshop.bead.compressionHint":
    "0 preserves center holes and gaps, 50 keeps small cross or diamond reliefs, and 100 closes them completely.",
  "workshop.bead.pressureLight": "0 · Light, open holes",
  "workshop.bead.pressureStandard": "50 · Standard",
  "workshop.bead.pressureTight": "100 · Tight, closed holes",
  "workshop.bead.beadPitch": "Bead pitch",
  "workshop.bead.beadPitchHint":
    "The 2.6 mm default is the center-to-center bead pitch and determines the physical canvas size handed to Lumina.",
  "workshop.bead.physicalSize": "{width} × {height} mm",
  "workshop.bead.rendering": "Rendering the high-resolution pressure preview…",
  "workshop.bead.newProject": "New pattern",
  "workshop.bead.handoff": "Send to Lumina Converter",
  "workshop.bead.handoffEmpty":
    "Keep at least one colored bead before converting",
  "workshop.bead.handoffSummaryTitle": "Send to Lumina Converter?",
  "workshop.bead.handoffSummaryDescription":
    "The source-color PNG will be sent. The current print library is recorded only as mapping provenance and never replaces artwork colors.",
  "workshop.bead.handoffSummary":
    "{columns} × {rows} cells · {width} × {height} mm · {compression}% pressure",
  "workshop.bead.handoffLibrary": "Mapping source: {label}",
  "workshop.bead.handoffNoLibrary": "No print library attached",
  "workshop.bead.handoffSummaryCancel": "Back to editing",
  "workshop.bead.handoffSummaryConfirm": "Continue to Lumina",
  "workshop.bead.replaceTitle": "Replace the current converter content?",
  "workshop.bead.replaceDescription":
    "The converter already contains an image or batch. Continuing replaces it with this bead canvas without deleting the autosaved bead project.",
  "workshop.bead.replaceCancel": "Keep current content",
  "workshop.bead.replaceConfirm": "Replace and continue",
  "workshop.bead.handoffError":
    "The current bead canvas could not be sent to the converter. Check the pattern and try again.",
  "workshop.bead.processingError":
    "Local image processing failed. The project is still on this device; retry the current step.",
  "workshop.bead.saveError":
    "Autosave temporarily failed. Edits in the current page are still intact.",
  "crop.title": "Crop pattern",
  "crop.description":
    "Drag on the preview to select the area to keep. Use the values below for precise adjustments.",
  "crop.previewAria": "Drag to select the pattern area to keep",
  "crop.x": "Left",
  "crop.y": "Top",
  "crop.width": "Width",
  "crop.height": "Height",
  "crop.cancel": "Cancel",
  "crop.original": "Use original",
  "crop.confirm": "Apply crop",
} as const satisfies Record<keyof typeof zhCN, string>;

export const messages = {
  "zh-CN": zhCN,
  "en-US": enUS,
} as const;

export type Locale = keyof typeof messages;
export type MessageKey = keyof typeof zhCN;

export function normalizeLocale(locale: string): Locale {
  return locale.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

export function translate(
  locale: Locale,
  key: string,
): string {
  const table = messages[locale] as Record<string, string>;
  return table[key] ?? key;
}

export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}
