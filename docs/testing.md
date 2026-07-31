# Testing Fuse Bead Studio

## Automated gate

Use the package-manager version declared in `package.json`:

```bash
pnpm install --frozen-lockfile
pnpm test:run
pnpm exec tsc --noEmit
node scripts/benchmark.mjs --check-regression
pnpm package
git diff --check
```

The gate covers recognition fixtures, property tests, editor history, worker cancellation and cleanup, source/print color separation, SDK `MessageChannel` integration, project and recipe compatibility, PNG handoff, the single-file runtime, deterministic packaging, and SHA-256 output.

Recognition tests generate their own numbered-grid, hard-pixel, ring, watermark, JPEG, transparent-support, crop, non-square, and near-tie fixtures. Third-party pattern artwork is not checked into the repository.

The benchmark must stay within `benchmarks/ci-budget.json`. It verifies 52×52 preview work, 104×104 full rendering, bounded main-thread slices and transfer size, and cleanup of the worker and temporary Blob URL.

## Package verification

`pnpm package` produces:

```text
artifacts/lumina.bead-pattern-1.0.2.lumina-workshop
artifacts/lumina.bead-pattern-1.0.2.lumina-workshop.sha256
```

The archive is reproducible byte for byte and contains only:

```text
LICENSE
README.md
assets/icon.png
manifest.json
ui/index.html
```

Validate it against the Lumina repository without executing module code:

```bash
python -m core.workshop.package_validator \
  /absolute/path/to/artifacts/lumina.bead-pattern-1.0.2.lumina-workshop
```

## Real host acceptance

Run this acceptance in the Lumina desktop security boundary at 1280×720. Check Chinese and English, light and dark themes.

1. Open **创意工坊 → 开发者** and install the local package.
2. Confirm that the permission screen lists `image.pick`, `project.storage`, `color-library.read`, and `handoff.image`.
3. Wait for the module to report ready; it must not be activated before a usable editor is rendered.
4. Exercise a numbered-grid screenshot, a hard-pixel chart, and a ring preview through calibration and correction.
5. Confirm empty cells and transparent-support cells remain distinguishable.
6. Move pressure through 0, 50, 80, 99, and 100. At 99 residual openings remain; at 100 center holes and four-bead valleys close.
7. Switch between source colors and the current LUT/material library. The preview may change; the source palette and saved recipe must not.
8. Confirm handoff, then verify that Lumina's existing converter receives the source-color PNG and correct physical dimensions.
9. Refresh and confirm the latest editable project is restored.
10. Load a malformed recipe and confirm the module shows an error while Lumina stays usable.
11. Attempt HTTP, HTTPS, WebSocket, popup, download, navigation, and cross-module requests; every escape must be blocked.

Capture 0/50/100 pressure states and the converter handoff for release evidence. Stop Lumina, Vite, Vitest, and any module dev server after the session.

## Release gate

Only an exact `v<semver>` tag may publish. The tag, `package.json`, and `manifest.json` versions must match. The Release contains exactly one versioned `.lumina-workshop` package and its `.sha256` companion—never a mutable `latest` asset.
