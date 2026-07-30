# Lumina Fuse Bead Studio

Lumina Studio 的官方拼豆工作台模块。它把清晰图纸或截图分析为可编辑的拼豆矩阵，模拟不同压合程度下豆子之间的挤压与熨烫融合，再把确认后的源色 PNG 交给 Lumina 原有的叠色打印流程。

它不是普通的“图片转像素图”滤镜。自动识别只是进入工作台的一条路径，网格、空位、透明支撑、低置信度格和最终颜色都可以继续校正。

## 支持的图纸

- **编号网格图**：识别规则网格，尽量避开格线、编号和覆盖文字后采样颜色。
- **硬边像素图**：从整数像素块推断正方形网格，保留透明像素与普通空位的区别。
- **圆豆俯视图**：从豆子圆环采样颜色，排除中心孔，并保留透明支撑格。

第一版面向清晰、正视、单一图案的 PNG、JPEG 或 WebP。透视实拍、倾斜网格、光照校正和通用照片转像素画不在支持范围内；不确定结果会进入校准或低置信度待处理列表，不会静默猜测。

## 从图纸到可打印图像

1. 选择图纸，确认识别类型。
2. 裁剪并校准行列、正方形网格、方向、空位和透明支撑样本。
3. 在矩阵中绘制、擦除、吸色、填充或标记透明支撑，逐项处理低置信度格。
4. 调整压合程度并实时查看豆间挤压效果。
5. 可选地把“图纸原色”映射到 Lumina 当前 LUT 或耗材档案，预览可打印颜色。
6. 确认物理尺寸和源色图像后，交给 Lumina 图像转换。

默认豆距是 **2.6 mm**，表示相邻豆子中心之间的物理间距。交接画布尺寸始终为 `列数 × 豆距` 与 `行数 × 豆距`。

### 压合程度

| 数值 | 预览含义 |
| ---: | --- |
| 0 | 保留完整中心孔和豆间间隙 |
| 50 | 标准压合，仍能看到细小十字或菱形凹点 |
| 80 | 高压合，豆间缝隙明显收窄但仍可辨认 |
| 100 | 完全压紧，关闭中心孔和四豆交汇凹点 |

99 仍会保留可见的微小开口；只有 100 才使用完全闭合的几何规则。这个参数描述同一种拼豆在不同熨烫/压合方法下的状态，不会改变豆子身份。

### 图纸原色与 Lumina 可打印色

“图纸原色”是工程和导出配方的权威颜色，不会因切换 LUT、耗材档案或手动映射而被覆盖。“当前打印色库”只是一个可更新、可逐色调整的预览映射；色库发生变化时，旧映射会明确标记为过期，也不会自动重排、隐藏或合并品牌颜色。

交给 Lumina 的始终是源色 PNG、物理尺寸和 `bead-recipe/v1` 配方。分层、叠色、3MF/打印输出仍由 Lumina 现有转换流程负责；本模块不模拟哑光烘焙纸或用户后处理材质。

## 安装与本地开发

正式版本以单个 `lumina.bead-pattern-<version>.lumina-workshop` GitHub Release 资产发布，并附带同名 SHA-256 文件。Lumina 通过创意工坊安装、启用、更新、回滚和卸载这个模块。

本地开发：

```bash
pnpm install --frozen-lockfile
pnpm test:run
pnpm exec tsc --noEmit
node scripts/benchmark.mjs --check-regression
pnpm package
```

随后在 Lumina 的“创意工坊 → 开发者”中安装 `artifacts/` 下的本地 `.lumina-workshop` 文件。不要用普通网页直接替代宿主验收；真实权限、项目存储、色库读取和图像交接只存在于 Lumina 宿主中。

详细测试步骤见 [docs/testing.md](docs/testing.md)，识别边界见 [docs/recognition-contract.md](docs/recognition-contract.md)。

## 权限与兼容性

模块只申请四项公开能力：

- `image.pick`：由 Lumina 选择并读取一张图纸；
- `project.storage`：保存可恢复的本地工程；
- `color-library.read`：读取去除内部路径后的当前色库；
- `handoff.image`：经用户确认后把源色 PNG 交给转换器。

运行时没有通用网络、文件系统路径、Electron API 或跨模块访问能力。完整信任边界见 [docs/security.md](docs/security.md)。

`bead-project/v1` 与 `bead-recipe/v1` 在 1.x 中保持向后可读；新增字段必须是可选字段，破坏性变化必须使用新的 schema 版本并提供显式迁移。安装包自身遵循 Lumina Workshop API `>=1.0.0 <2.0.0`。

## English

Fuse Bead Studio is the official installable Lumina Workshop module for turning clear pattern charts into an editable bead matrix and a pressure-aware fused-bead render. It supports numbered grids, hard-pixel charts, and top-down ring previews; uncertain cells stay visible and editable.

The source palette remains authoritative. A selected Lumina LUT or material archive may provide a separate printable-color preview without mutating, ranking, hiding, or deduplicating source or library colors. Handoff sends the source-color PNG, the `2.6 mm` default pitch, and the compatible `bead-recipe/v1` payload into Lumina's existing layered-color converter.

Pressure presets at 0, 50, 80, and 100 range from open holes to fully closed center holes and four-bead valleys. A value of 99 deliberately retains residual openings.

The module runs without general network, filesystem-path, Electron, or cross-module access. See [testing](docs/testing.md), [recognition contract](docs/recognition-contract.md), and [security](docs/security.md) for the complete development and trust boundaries.
