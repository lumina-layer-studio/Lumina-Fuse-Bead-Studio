const zhCN = {
  "app.name": "拼豆工作台",
  "app.description": "把清晰拼豆图纸识别为可编辑矩阵，再生成可调压合预览。",
  "workshop.bead.name": "拼豆模式",
  "workshop.bead.description":
    "读取清晰拼豆图纸或截图，校准格子并生成可继续编辑的拼豆矩阵。",
  "workshop.bead.intro":
    "上传编号格图、硬边像素图或数字圆豆俯视图。下一步会让你确认网格和空格，不会自动猜测倾斜实拍。",
  "workshop.bead.choosePattern": "选择拼豆图纸",
  "workshop.bead.createBlankCanvas": "新建空白底板",
  "workshop.bead.blankCanvasHint":
    "也可以从 32 × 32 空白底板开始，画到边缘时自动扩展。",
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
  "workshop.bead.returnToEditor": "返回编辑器",
  "workshop.bead.inputMode": "图纸类型",
  "workshop.bead.mode.numbered-grid": "编号网格图",
  "workshop.bead.mode.hard-pixel": "硬边像素图",
  "workshop.bead.mode.ring-preview": "圆豆俯视图",
  "workshop.bead.mode.ambiguous": "需要手动确认",
  "workshop.bead.classification": "建议：{mode} · 置信度 {confidence}%",
  "workshop.bead.classifying": "正在分析图纸类型…",
  "workshop.bead.classificationUnavailable":
    "未能自动判断图纸类型，请手动确认。",
  "workshop.bead.cropRequired":
    "检测到截图边框、多图布局或图纸未完整显示，请先裁剪并只保留一张完整图纸。",
  "workshop.bead.rows": "行数",
  "workshop.bead.columns": "列数",
  "workshop.bead.originX": "网格原点 X",
  "workshop.bead.originY": "网格原点 Y",
  "workshop.bead.gridInvalid":
    "当前网格不是正方形。可自动收紧右侧或下侧边界，也可手动调整行列、原点与裁剪。",
  "workshop.bead.fitSquareGrid": "自动收紧到正方形网格",
  "workshop.bead.emptyDecisionRequired":
    "请先选择一个空位样本，或明确图中没有空位。",
  "workshop.bead.pickEmpty": "选择一个空位",
  "workshop.bead.noEmpty": "图中没有空位",
  "workshop.bead.emptySample": "空位样本：第 {index} 格",
  "workshop.bead.noEmptySelected": "已确认：图中没有空位",
  "workshop.bead.rotate0": "旋转 0°",
  "workshop.bead.rotate90": "旋转 90°",
  "workshop.bead.rotate180": "旋转 180°",
  "workshop.bead.rotate270": "旋转 270°",
  "workshop.bead.flipHorizontal": "水平翻转",
  "workshop.bead.flipVertical": "垂直翻转",
  "workshop.bead.recognize": "识别拼豆矩阵",
  "workshop.bead.recognizing": "正在识别拼豆矩阵…",
  "workshop.bead.calibrationCanvas": "拼豆图纸网格校准",
  "workshop.bead.editorTitle": "编辑豆子",
  "workshop.bead.editorDescription":
    "直接在图案上放豆、擦除或取色，再预览熨烫后的成品效果。",
  "workshop.bead.viewport.toolbar": "画布缩放",
  "workshop.bead.viewport.zoomOut": "缩小",
  "workshop.bead.viewport.currentZoom": "当前缩放：{percent}%",
  "workshop.bead.viewport.resetZoom": "重置为 100%",
  "workshop.bead.viewport.zoomIn": "放大",
  "workshop.bead.viewport.fit": "适合窗口",
  "workshop.bead.viewport.pan": "平移",
  "workshop.bead.viewport.threeToolbar": "三维预览视图控制",
  "workshop.bead.viewport.threeZoomOut": "缩小三维预览",
  "workshop.bead.viewport.threeReset": "重置视角",
  "workshop.bead.viewport.threeZoomIn": "放大三维预览",
  "workshop.bead.viewport.threeFit": "适合窗口",
  "workshop.bead.threeInteractionMode": "三维交互模式",
  "workshop.bead.threeEditMode": "编辑豆子",
  "workshop.bead.threeViewMode": "调整视角",
  "workshop.bead.workspace.project": "当前图案",
  "workshop.bead.workspace.workflow": "工作模式",
  "workshop.bead.workspace.modeControls": "当前模式设置",
  "workshop.bead.workspace.output": "打印输出",
  "workshop.bead.workspace.auxiliary": "2D 校对",
  "workshop.bead.workspace.auxiliaryViews": "二维校对视图",
  "workshop.bead.workspace.auxiliaryExpand": "展开 2D 校对",
  "workshop.bead.workspace.auxiliaryCollapse": "收起 2D 校对",
  "workshop.bead.workspace.projectMenu": "图案操作",
  "workshop.bead.workspace.untitled": "未命名图案",
  "workshop.bead.workspace.mode.edit": "编辑豆子",
  "workshop.bead.workspace.mode.fusion": "调整熨烫",
  "workshop.bead.workspace.mode.print": "打印准备",
  "workshop.bead.workspace.printShort": "打印",
  "workshop.bead.floating.views": "视图",
  "workshop.bead.floating.edit": "放豆与修正",
  "workshop.bead.floating.inspector": "成品效果",
  "workshop.bead.floating.collapseEdit": "收起放豆工具",
  "workshop.bead.floating.expandEdit": "展开放豆工具",
  "workshop.bead.floating.collapseInspector": "收起成品设置",
  "workshop.bead.floating.expandInspector": "展开成品设置",
  "workshop.bead.floating.openEdit": "打开放豆工具",
  "workshop.bead.floating.openInspector": "打开成品设置",
  "workshop.bead.toolsTitle": "放豆工具",
  "workshop.bead.paletteTitle": "豆子颜色",
  "workshop.bead.tool.paint": "放豆",
  "workshop.bead.tool.erase": "擦除",
  "workshop.bead.tool.eraseFill": "清除连片",
  "workshop.bead.tool.eyedropper": "取色",
  "workshop.bead.tool.fill": "填充区域",
  "workshop.bead.toolHint.paint": "点击或拖动格子，使用当前颜色补豆。",
  "workshop.bead.toolHint.erase": "点击或拖动格子，逐颗移除豆子。",
  "workshop.bead.toolHint.eraseFill":
    "点击色块，一次清空与它上下左右相连的同色区域。",
  "workshop.bead.toolHint.eyedropper":
    "点击格子取色，并自动切换到放豆或擦除。",
  "workshop.bead.toolHint.fill":
    "点击色块，使用当前颜色填满与它上下左右相连的同色区域。",
  "workshop.bead.undo": "撤销",
  "workshop.bead.redo": "重做",
  "workshop.bead.previousIssue": "上一个待复核格",
  "workshop.bead.nextIssue": "下一个待复核格",
  "workshop.bead.reviewSummary": "待复核 {pending} / 共 {total}",
  "workshop.bead.view.original": "原图",
  "workshop.bead.view.matrix": "编辑豆子",
  "workshop.bead.view.pressure": "熨烫效果",
  "workshop.bead.view.three": "3D 成品",
  "workshop.bead.preview.source": "原图颜色",
  "workshop.bead.preview.print": "耗材颜色",
  "workshop.bead.printLibraryUnavailable":
    "尚未读取到耗材颜色，仍可使用原图颜色编辑。",
  "workshop.bead.reloadPrintLibrary": "重新读取耗材颜色",
  "workshop.bead.printMappingRequired":
    "先匹配一次耗材颜色，再预览耗材效果。",
  "workshop.bead.printMappingStale":
    "Lumina 的耗材颜色已经变化；旧的匹配结果不会被静默替换。",
  "workshop.bead.createPrintMapping": "匹配耗材颜色",
  "workshop.bead.refreshPrintMapping": "按当前耗材重新匹配",
  "workshop.bead.printMappingTitle": "图案颜色 → 耗材颜色",
  "workshop.bead.printColorFor": "图案颜色 {index}",
  "workshop.bead.printLibraryLabel": "当前耗材：{label}",
  "workshop.bead.matrixCanvas": "可编辑拼豆图案",
  "workshop.bead.pressureCanvas": "拼豆熨烫效果",
  "workshop.bead.threeCanvas": "可旋转的拼豆 3D 成品",
  "workshop.bead.threeFallbackCanvas": "拼豆二维熨烫效果（3D 安全降级）",
  "workshop.bead.threeHint":
    "默认从正上方查看，方向和 2D 一致。选择“编辑豆子”后，左键或单指直接使用当前工具；选择“调整视角”后，拖动旋转，滚轮或双指缩放。桌面端也可用右键旋转、中键平移。",
  "workshop.bead.threeRendering": "正在更新 3D 成品…",
  "workshop.bead.threeLimitHint":
    "当前图案有 {count} 颗豆，超过 {limit} 颗的交互式 3D 安全上限；已显示同样效果的 2D 熨烫预览。",
  "workshop.bead.originalCanvas": "拼豆图纸原图",
  "workshop.bead.magnifier": "选中格局部放大",
  "workshop.bead.showGrid": "显示网格",
  "workshop.bead.paletteColor": "颜色 {index}",
  "workshop.bead.palettePrevious": "查看前面的颜色",
  "workshop.bead.paletteNext": "查看更多颜色",
  "workshop.bead.customColor": "添加自定义颜色",
  "workshop.bead.compression": "熨烫程度",
  "workshop.bead.compressionHint":
    "综合模拟热量、时间与压力：0 是紧密排列并保留孔的豆子，50 接触熔合并保留孔，接近 90 时只留微孔与交汇凹点，100 是平熔无孔；外圈仍保留受挤压的豆形波峰。",
  "workshop.bead.pressureLight": "0 · 有孔",
  "workshop.bead.pressureStandard": "50 · 标准",
  "workshop.bead.pressureTight": "100 · 无孔",
  "workshop.bead.irregularity": "自然形变",
  "workshop.bead.irregularityHint":
    "关闭时保持标准豆板网格；开启后会按固定规律轻微改变豆心、色界流动和外圈波峰深浅，越接近熔合状态越明显，不会随机闪动或把豆子扭成异形。",
  "workshop.bead.beadPitch": "豆子间距",
  "workshop.bead.beadPitchHint":
    "默认 2.6 mm，表示相邻豆子中心间距，并决定最终打印尺寸。",
  "workshop.bead.physicalSize": "成品尺寸：{width} × {height} mm",
  "workshop.bead.estimatedThickness":
    "预计成品厚度：{thickness} mm（中间档为估算；100% 无孔以一元硬币厚度为基准）",
  "workshop.bead.rendering": "正在计算高分辨率熨烫效果…",
  "workshop.bead.newProject": "新建图纸",
  "workshop.bead.returnCalibration": "返回校准",
  "workshop.bead.handoff": "生成打印文件",
  "workshop.bead.handoffEmpty": "至少保留一颗有颜色的豆子后才能生成打印文件",
  "workshop.bead.handoffSummaryTitle": "确认生成打印文件？",
  "workshop.bead.handoffSummaryDescription":
    "下一步会把当前拼豆图案发送到 Lumina 图像转换，继续生成打印文件。将优先使用原图颜色，并附带耗材颜色映射。",
  "workshop.bead.handoffSummary":
    "{columns} × {rows} 格 · {width} × {height} × {thickness} mm · 熨烫 {compression}% · 自然形变 {irregularity}%",
  "workshop.bead.handoffLibrary": "映射来源：{label}",
  "workshop.bead.handoffNoLibrary": "未绑定耗材颜色",
  "workshop.bead.handoffSummaryCancel": "返回编辑",
  "workshop.bead.handoffSummaryConfirm": "继续生成",
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
  "workshop.bead.createBlankCanvas": "Create blank pegboard",
  "workshop.bead.blankCanvasHint":
    "Or start from a blank 32 × 32 pegboard that expands near its edges.",
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
  "workshop.bead.returnToEditor": "Back to editor",
  "workshop.bead.inputMode": "Pattern type",
  "workshop.bead.mode.numbered-grid": "Numbered grid",
  "workshop.bead.mode.hard-pixel": "Hard-edged pixel chart",
  "workshop.bead.mode.ring-preview": "Top-down ring preview",
  "workshop.bead.mode.ambiguous": "Needs manual confirmation",
  "workshop.bead.classification": "Suggested: {mode} · {confidence}% confidence",
  "workshop.bead.classifying": "Analyzing the pattern type…",
  "workshop.bead.classificationUnavailable":
    "The pattern type could not be detected automatically. Confirm it manually.",
  "workshop.bead.cropRequired":
    "This image contains screenshot chrome, multiple patterns, or an incomplete chart. Crop it to one complete pattern first.",
  "workshop.bead.rows": "Rows",
  "workshop.bead.columns": "Columns",
  "workshop.bead.originX": "Grid origin X",
  "workshop.bead.originY": "Grid origin Y",
  "workshop.bead.gridInvalid":
    "The grid is not square. Fit the right or bottom edge automatically, or adjust rows, columns, the origin, and crop.",
  "workshop.bead.fitSquareGrid": "Fit to square grid",
  "workshop.bead.emptyDecisionRequired":
    "Choose an empty-cell sample or explicitly confirm that the pattern has no empty cells.",
  "workshop.bead.pickEmpty": "Choose an empty cell",
  "workshop.bead.noEmpty": "No empty cells",
  "workshop.bead.emptySample": "Empty sample: cell {index}",
  "workshop.bead.noEmptySelected": "Confirmed: no empty cells",
  "workshop.bead.rotate0": "Rotate 0°",
  "workshop.bead.rotate90": "Rotate 90°",
  "workshop.bead.rotate180": "Rotate 180°",
  "workshop.bead.rotate270": "Rotate 270°",
  "workshop.bead.flipHorizontal": "Flip horizontally",
  "workshop.bead.flipVertical": "Flip vertically",
  "workshop.bead.recognize": "Recognize bead matrix",
  "workshop.bead.recognizing": "Recognizing bead matrix…",
  "workshop.bead.calibrationCanvas": "Bead pattern grid calibration",
  "workshop.bead.editorTitle": "Edit beads",
  "workshop.bead.editorDescription":
    "Place, remove, or sample beads directly on the pattern, then preview the finished ironing result.",
  "workshop.bead.viewport.toolbar": "Canvas zoom",
  "workshop.bead.viewport.zoomOut": "Zoom out",
  "workshop.bead.viewport.currentZoom": "Current zoom: {percent}%",
  "workshop.bead.viewport.resetZoom": "Reset to 100%",
  "workshop.bead.viewport.zoomIn": "Zoom in",
  "workshop.bead.viewport.fit": "Fit to window",
  "workshop.bead.viewport.pan": "Pan",
  "workshop.bead.viewport.threeToolbar": "3D preview controls",
  "workshop.bead.viewport.threeZoomOut": "Zoom out 3D preview",
  "workshop.bead.viewport.threeReset": "Reset view",
  "workshop.bead.viewport.threeZoomIn": "Zoom in 3D preview",
  "workshop.bead.viewport.threeFit": "Fit to window",
  "workshop.bead.threeInteractionMode": "3D interaction mode",
  "workshop.bead.threeEditMode": "Edit beads",
  "workshop.bead.threeViewMode": "Adjust view",
  "workshop.bead.workspace.project": "Current pattern",
  "workshop.bead.workspace.workflow": "Workflow",
  "workshop.bead.workspace.modeControls": "Current workflow controls",
  "workshop.bead.workspace.output": "Print output",
  "workshop.bead.workspace.auxiliary": "2D check",
  "workshop.bead.workspace.auxiliaryViews": "2D check views",
  "workshop.bead.workspace.auxiliaryExpand": "Expand 2D check",
  "workshop.bead.workspace.auxiliaryCollapse": "Collapse 2D check",
  "workshop.bead.workspace.projectMenu": "Pattern actions",
  "workshop.bead.workspace.untitled": "Untitled pattern",
  "workshop.bead.workspace.mode.edit": "Edit beads",
  "workshop.bead.workspace.mode.fusion": "Adjust ironing",
  "workshop.bead.workspace.mode.print": "Print setup",
  "workshop.bead.workspace.printShort": "Print",
  "workshop.bead.floating.views": "Views",
  "workshop.bead.floating.edit": "Place & fix beads",
  "workshop.bead.floating.inspector": "Finished look",
  "workshop.bead.floating.collapseEdit": "Collapse bead tools",
  "workshop.bead.floating.expandEdit": "Expand bead tools",
  "workshop.bead.floating.collapseInspector":
    "Collapse finished-look settings",
  "workshop.bead.floating.expandInspector":
    "Expand finished-look settings",
  "workshop.bead.floating.openEdit": "Open bead tools",
  "workshop.bead.floating.openInspector": "Open finished-look settings",
  "workshop.bead.toolsTitle": "Bead tools",
  "workshop.bead.paletteTitle": "Bead colors",
  "workshop.bead.tool.paint": "Place beads",
  "workshop.bead.tool.erase": "Remove",
  "workshop.bead.tool.eraseFill": "Clear connected area",
  "workshop.bead.tool.eyedropper": "Pick color",
  "workshop.bead.tool.fill": "Fill area",
  "workshop.bead.toolHint.paint":
    "Click or drag across cells to paint with the current color.",
  "workshop.bead.toolHint.erase":
    "Click or drag across cells to remove beads one at a time.",
  "workshop.bead.toolHint.eraseFill":
    "Click a color area to erase the matching cells connected above, below, left, or right.",
  "workshop.bead.toolHint.eyedropper":
    "Click a cell to sample it, then continue with Place beads or Remove.",
  "workshop.bead.toolHint.fill":
    "Click a color area to fill the matching cells connected above, below, left, or right.",
  "workshop.bead.undo": "Undo",
  "workshop.bead.redo": "Redo",
  "workshop.bead.previousIssue": "Previous review cell",
  "workshop.bead.nextIssue": "Next review cell",
  "workshop.bead.reviewSummary": "{pending} pending / {total} total",
  "workshop.bead.view.original": "Original",
  "workshop.bead.view.matrix": "Edit beads",
  "workshop.bead.view.pressure": "Ironing result",
  "workshop.bead.view.three": "3D result",
  "workshop.bead.preview.source": "Original colors",
  "workshop.bead.preview.print": "Filament colors",
  "workshop.bead.printLibraryUnavailable":
    "No filament colors are available yet. You can keep editing with the original colors.",
  "workshop.bead.reloadPrintLibrary": "Reload filament colors",
  "workshop.bead.printMappingRequired":
    "Match filament colors once before previewing the filament result.",
  "workshop.bead.printMappingStale":
    "Lumina's filament colors changed. The previous matches will not be silently replaced.",
  "workshop.bead.createPrintMapping": "Match filament colors",
  "workshop.bead.refreshPrintMapping": "Rematch current filaments",
  "workshop.bead.printMappingTitle": "Pattern colors → Filament colors",
  "workshop.bead.printColorFor": "Pattern color {index}",
  "workshop.bead.printLibraryLabel": "Current filaments: {label}",
  "workshop.bead.matrixCanvas": "Editable bead pattern",
  "workshop.bead.pressureCanvas": "Bead ironing result",
  "workshop.bead.threeCanvas": "Rotatable 3D bead result",
  "workshop.bead.threeFallbackCanvas":
    "2D bead ironing result (3D safety fallback)",
  "workshop.bead.threeHint":
    "The default view looks straight down and matches the 2D direction. Choose Edit beads to use the current tool with left click or one finger. Choose Adjust view to drag, rotate, and zoom with the wheel or two fingers. On desktop, right drag rotates and middle drag pans.",
  "workshop.bead.threeRendering": "Updating 3D result…",
  "workshop.bead.threeLimitHint":
    "This pattern contains {count} beads, above the {limit}-bead interactive 3D safety limit. The matching 2D ironing result is shown instead.",
  "workshop.bead.originalCanvas": "Original bead pattern",
  "workshop.bead.magnifier": "Selected-cell magnifier",
  "workshop.bead.showGrid": "Show grid",
  "workshop.bead.paletteColor": "Color {index}",
  "workshop.bead.palettePrevious": "Show previous colors",
  "workshop.bead.paletteNext": "Show more colors",
  "workshop.bead.customColor": "Add custom color",
  "workshop.bead.compression": "Ironing level",
  "workshop.bead.compressionHint":
    "Combines heat, time, and pressure: 0 keeps tightly packed beads with open holes, 50 is a standard open-hole fuse, near 90 leaves only pinholes and junction dents, and 100 is a flat no-hole melt while the exposed rim keeps compressed bead peaks.",
  "workshop.bead.pressureLight": "0 · Open holes",
  "workshop.bead.pressureStandard": "50 · Standard",
  "workshop.bead.pressureTight": "100 · No holes",
  "workshop.bead.irregularity": "Natural variation",
  "workshop.bead.irregularityHint":
    "Off keeps the pegboard grid exact. Higher values apply stable, small changes to bead centers, color flow, and exposed rim valleys as fusion increases, without flicker or distorted bead shapes.",
  "workshop.bead.beadPitch": "Bead spacing",
  "workshop.bead.beadPitchHint":
    "The 2.6 mm default is the center-to-center bead spacing and determines the final print size.",
  "workshop.bead.physicalSize": "Finished size: {width} × {height} mm",
  "workshop.bead.estimatedThickness":
    "Estimated finished thickness: {thickness} mm (intermediate settings are estimates; the 100% no-hole state uses a one-yuan coin as its reference)",
  "workshop.bead.rendering": "Rendering the high-resolution ironing result…",
  "workshop.bead.newProject": "New pattern",
  "workshop.bead.returnCalibration": "Back to calibration",
  "workshop.bead.handoff": "Create print file",
  "workshop.bead.handoffEmpty":
    "Keep at least one colored bead before creating a print file",
  "workshop.bead.handoffSummaryTitle": "Create the print file?",
  "workshop.bead.handoffSummaryDescription":
    "Next, this bead pattern will be sent to Lumina Image Conversion to continue creating the print file. Original colors stay authoritative, with filament color matches attached.",
  "workshop.bead.handoffSummary":
    "{columns} × {rows} cells · {width} × {height} × {thickness} mm · {compression}% ironing · {irregularity}% natural variation",
  "workshop.bead.handoffLibrary": "Mapping source: {label}",
  "workshop.bead.handoffNoLibrary": "No filament colors attached",
  "workshop.bead.handoffSummaryCancel": "Back to editing",
  "workshop.bead.handoffSummaryConfirm": "Continue",
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
