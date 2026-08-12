import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Workshop theme contract", () => {
  it("consumes the public host tokens and uses a theme-aware canvas", async () => {
    const css = await readFile("src/ui/theme.css", "utf8");

    expect(css).toMatch(
      /--bead-canvas:\s*var\(\s*--lumina-surface-canvas,\s*var\(\s*--lumina-surface,/,
    );
    expect(css).toMatch(
      /--bead-text:\s*var\(\s*--lumina-text-primary,\s*var\(\s*--lumina-text,/,
    );
    expect(css).toMatch(
      /--bead-border:\s*var\(\s*--lumina-border-subtle,\s*var\(\s*--lumina-border,/,
    );
    expect(css).toMatch(/body\s*{[\s\S]*var\(--bead-canvas\)/);
    expect(css).toMatch(
      /\.bead-canvas--matrix\s*{[^}]*border-radius:\s*0\s*;/,
    );
    expect(css).toMatch(
      /\.bead-three-preview\s*{[^}]*height:\s*100%\s*;/,
    );
    expect(css).toMatch(
      /\.bead-three-preview canvas\s*{[^}]*touch-action:\s*none\s*;/,
    );
    expect(css).toMatch(
      /\.bead-three-preview\[data-interaction-mode="edit"\]\s+canvas\s*{[^}]*cursor:\s*crosshair\s*;/,
    );
    expect(css).toMatch(
      /\.bead-three-preview\[data-interaction-mode="view"\]\s+canvas\s*{[^}]*cursor:\s*grab\s*;/,
    );
    expect(css).toMatch(
      /\.bead-three-preview__mode-switch\s*{[^}]*display:\s*flex\s*;[^}]*flex:\s*0\s+0\s+auto\s*;[^}]*border-right:\s*1px solid var\(--bead-border\)\s*;/,
    );
    expect(css).not.toMatch(
      /\.bead-three-preview__mode-switch\s*{[^}]*position:\s*absolute\s*;/,
    );
  });

  it("keeps the bead editor in a responsive 3D-first workspace without permanent scroll docks", async () => {
    const css = await readFile("src/ui/theme.css", "utf8");
    const floatingWorkspace = css.match(
      /\/\* bead editor floating workspace \*\/[\s\S]*?\/\* end bead editor floating workspace \*\//,
    )?.[0];

    expect(floatingWorkspace).toBeDefined();
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace\s*{[\s\S]*?container:\s*bead-editor-workspace\s*\/\s*inline-size;[\s\S]*?position:\s*relative;[\s\S]*?min-width:\s*0;[\s\S]*?isolation:\s*isolate;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__canvas\s*{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?\.bead-editor-workspace__canvas\s*>\s*\.canvas-stage\s*{[\s\S]*?padding:\s*76px\s*16px\s*124px\s*88px;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__topbar,[\s\S]*?\.bead-editor-workspace__tools,[\s\S]*?\.bead-editor-workspace__mode-dock,[\s\S]*?\.bead-editor-workspace__auxiliary\s*{[\s\S]*?position:\s*absolute;[\s\S]*?pointer-events:\s*auto;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__tools\s*{[\s\S]*?left:\s*16px;[\s\S]*?width:\s*64px;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__tools\s*{[^}]*bottom:\s*auto;[^}]*justify-content:\s*flex-start;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-project-control\s*{[^}]*padding:\s*6px\s+8px\s+6px\s+48px;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__mode-dock\s*{[\s\S]*?right:\s*272px;[\s\S]*?bottom:\s*12px;[\s\S]*?left:\s*88px;[\s\S]*?overflow-y:\s*hidden;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace\[data-mode="edit"\]\s+\.bead-editor-workspace__mode-dock\s*{[^}]*left:\s*calc\(50%\s*-\s*92px\);[^}]*width:\s*min\(760px,[^}]*height:\s*96px;[^}]*transform:\s*translateX\(-50%\);/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__auxiliary\s*{[\s\S]*?right:\s*16px;[\s\S]*?bottom:\s*12px;[\s\S]*?width:\s*260px;[\s\S]*?height:\s*104px;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-auxiliary__inspection\s*{[^}]*position:\s*static;[^}]*width:\s*52px;[^}]*aspect-ratio:\s*1;/,
    );
    expect(css).toMatch(
      /\.palette-swatch__bead\s*{[^}]*width:\s*42px;[^}]*height:\s*42px;/,
    );
    expect(floatingWorkspace).toMatch(
      /@container\s+bead-editor-workspace\s*\(max-width:\s*760px\)[\s\S]*?\.bead-editor-workspace__topbar\s*{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+auto;[\s\S]*?\.bead-editor-workspace__output\s+\.button\s*{[^}]*width:\s*42px;[^}]*height:\s*42px;[\s\S]*?\.bead-editor-workspace__output\s+\.button\s*>\s*span:last-child\s*{[^}]*display:\s*none;[\s\S]*?\.bead-editor-output-button__compact\s*{[^}]*display:\s*inline;[^}]*white-space:\s*nowrap;[\s\S]*?\.bead-editor-workspace__auxiliary\s*{[^}]*width:\s*46px;[^}]*height:\s*42px;[\s\S]*?\.bead-editor-workspace__auxiliary\[data-expanded="true"\]\s*{[^}]*left:\s*72px;[^}]*height:\s*auto;/,
    );
    expect(floatingWorkspace).not.toMatch(
      /@container\s+bead-editor-workspace\s*\(max-width:\s*760px\)[\s\S]*?\.bead-editor-workspace__(?:project|auxiliary)\s*{[^}]*display:\s*none;/,
    );
    expect(floatingWorkspace).toMatch(
      /@media\s*\(max-height:\s*680px\)[\s\S]*?\.bead-editor-workspace__tools\s*{[^}]*width:\s*112px;[\s\S]*?\.bead-editor-tool-rail\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*1fr\);/,
    );
    expect(floatingWorkspace).not.toMatch(/\.bead-editor-dock/);
    expect(floatingWorkspace).not.toMatch(/overflow-y:\s*auto/);
    expect(floatingWorkspace).not.toMatch(
      /backdrop-filter|:\s*(?:#fff(?:fff)?\b|white\s*[;,])/i,
    );
    expect(css).toMatch(/\.workbench-layout\s*{/);
    expect(css).toMatch(/\.panel--controls,/);
  });

  it("lets the editor fill the iframe without a nested vertical scrollbar", async () => {
    const css = await readFile("src/ui/theme.css", "utf8");

    expect(css).toMatch(
      /html,\s*body,\s*#root\s*{[^}]*height:\s*100%\s*;[^}]*}/,
    );
    expect(css).toMatch(
      /\.module-shell--editor\s*{[^}]*width:\s*100%\s*;[^}]*max-width:\s*none\s*;[^}]*height:\s*100%\s*;[^}]*padding:\s*0\s*;[^}]*overflow:\s*hidden\s*;/,
    );
    expect(css).toMatch(
      /\.workbench-stack--editor\s*{[^}]*height:\s*100%\s*;[^}]*min-height:\s*0\s*;/,
    );
    expect(css).toMatch(
      /\.workbench-stack--editor\s*>\s*\.status-banner\s*{[^}]*top:\s*68px\s*;[^}]*left:\s*50%\s*;[^}]*transform:\s*translateX\(-50%\)\s*;/,
    );
    expect(css).toMatch(
      /\.bead-editor-workspace\s*{[^}]*height:\s*100%\s*;[^}]*min-height:\s*0\s*;[^}]*border:\s*0\s*;[^}]*border-radius:\s*0\s*;/,
    );
    expect(css).toMatch(
      /\.bead-editor-workspace__canvas\s*>\s*\.canvas-stage\s*{[^}]*overflow:\s*hidden\s*;/,
    );
    expect(css).not.toMatch(/\.bead-editor-dock__body\s*{/);
    expect(css).not.toMatch(
      /\.print-mapping-list\s*{[^}]*overflow:\s*auto\s*;/,
    );
    expect(css).toMatch(
      /\.bead-three-preview-stack\s*{[^}]*position:\s*relative\s*;[^}]*height:\s*100%\s*;/,
    );
    expect(css).toMatch(
      /\.bead-three-preview\s*{[^}]*height:\s*100%\s*;[^}]*border:\s*0\s*;[^}]*border-radius:\s*0\s*;/,
    );
    expect(css).toMatch(
      /\.bead-canvas-viewport__content\s*>\s*\.bead-canvas,\s*\.bead-canvas-viewport__content\s*>\s*\.bead-fusion-preview\s*{[^}]*width:\s*100%\s*;[^}]*max-width:\s*none\s*;[^}]*height:\s*100%\s*;[^}]*max-height:\s*none\s*;/,
    );
    expect(css).toMatch(
      /\.bead-canvas-viewport__toolbar\s*{[^}]*border:\s*1px solid var\(--bead-border\)\s*;[^}]*border-radius:\s*999px\s*;[^}]*box-shadow:\s*var\(--bead-shadow\)\s*;/,
    );
    expect(css).toMatch(
      /\.bead-three-preview__toolbar\s*{[^}]*max-width:\s*calc\(100% - 24px\)\s*;[^}]*overflow-x:\s*auto\s*;/,
    );
    expect(css).toMatch(
      /\.bead-three-preview__hint\s*{[^}]*pointer-events:\s*none\s*;/,
    );
    expect(css).toMatch(
      /\.bead-three-preview__rendering-status\s*{[^}]*pointer-events:\s*none\s*;/,
    );
    expect(css).toMatch(
      /@container\s+bead-editor-workspace\s*\(max-width:\s*760px\)[\s\S]*?\.bead-editor-workspace__mode-dock\s*{[^}]*right:\s*12px;[^}]*left:\s*72px;/,
    );
  });
});
