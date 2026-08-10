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
      /\.bead-three-preview\s*{[^}]*height:\s*clamp\(/,
    );
    expect(css).toMatch(
      /\.bead-three-preview canvas\s*{[^}]*touch-action:\s*none\s*;/,
    );
  });

  it("keeps the bead editor in a responsive floating workspace without intercepting its canvas", async () => {
    const css = await readFile("src/ui/theme.css", "utf8");
    const floatingWorkspace = css.match(
      /\/\* bead editor floating workspace \*\/[\s\S]*?\/\* end bead editor floating workspace \*\//,
    )?.[0];

    expect(floatingWorkspace).toBeDefined();
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace\s*{[\s\S]*?container:\s*bead-editor-workspace\s*\/\s*inline-size;[\s\S]*?position:\s*relative;[\s\S]*?min-width:\s*0;[\s\S]*?isolation:\s*isolate;[\s\S]*?overflow:\s*hidden;[\s\S]*?--bead-editor-left-dock:\s*clamp\(248px,\s*24cqi,\s*320px\);[\s\S]*?--bead-editor-right-dock:\s*clamp\(280px,\s*26cqi,\s*350px\);[\s\S]*?--bead-editor-collapsed-dock:\s*44px;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__canvas\s*{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?\.bead-editor-workspace__canvas\s*>\s*\.canvas-stage\s*{[\s\S]*?padding:\s*68px\s*calc\(var\(--bead-editor-right-dock\)\s*\+\s*24px\)\s*24px\s*calc\(var\(--bead-editor-left-dock\)\s*\+\s*24px\);/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__overlay\s*{[\s\S]*?pointer-events:\s*none;[\s\S]*?\.bead-editor-workspace__views,[\s\S]*?\.bead-editor-dock,[\s\S]*?\.bead-editor-workspace__mobile-actions\s*{[\s\S]*?pointer-events:\s*auto;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__views\s*{[\s\S]*?left:\s*calc\(var\(--bead-editor-left-dock\)\s*\+\s*24px\);[\s\S]*?right:\s*calc\(var\(--bead-editor-right-dock\)\s*\+\s*24px\);/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-dock\s*{[\s\S]*?position:\s*absolute;[\s\S]*?overflow:\s*hidden;[\s\S]*?border:\s*1px\s+solid\s+var\(--bead-border\);[\s\S]*?background:\s*var\(--bead-surface-strong\);[\s\S]*?box-shadow:\s*var\(--bead-shadow\);/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__title\s*{[\s\S]*?position:\s*absolute;[\s\S]*?width:\s*1px;[\s\S]*?clip:\s*rect\(0,\s*0,\s*0,\s*0\);[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__magnifier\s*{[\s\S]*?right:\s*calc\(var\(--bead-editor-right-dock\)\s*\+\s*24px\);/,
    );
    expect(floatingWorkspace).toMatch(
      /@container\s+bead-editor-workspace\s*\(max-width:\s*900px\)[\s\S]*?--bead-editor-left-dock:\s*0;[\s\S]*?\.bead-editor-workspace\[data-mobile-drawer="edit"\]\s+\.bead-editor-dock--left\s*{[\s\S]*?display:\s*flex;[\s\S]*?\.bead-editor-workspace\[data-mobile-drawer="inspector"\]\s+\.bead-editor-dock--right\s*{[\s\S]*?display:\s*flex;[\s\S]*?\.bead-editor-workspace\[data-mobile-drawer="edit"\]\s+\.bead-editor-workspace__magnifier,[\s\S]*?\.bead-editor-workspace\[data-mobile-drawer="inspector"\]\s+\.bead-editor-workspace__magnifier\s*{[\s\S]*?display:\s*none;/,
    );
    expect(floatingWorkspace).toMatch(
      /\.bead-editor-workspace__views\s+\.view-tabs,[\s\S]*?\.bead-editor-dock\s+\.palette-row\s*{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?overflow-x:\s*auto;[\s\S]*?\.bead-editor-workspace__views\s+\.view-tabs\s*>\s*\*,[\s\S]*?\.bead-editor-dock\s+\.palette-row\s*>\s*\*\s*{[\s\S]*?flex:\s*0\s+0\s+auto;/,
    );
    expect(floatingWorkspace).toMatch(
      /@container\s+bead-editor-workspace\s*\(max-width:\s*520px\)[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
    );
    expect(floatingWorkspace).not.toMatch(
      /backdrop-filter|:\s*(?:#fff(?:fff)?\b|white\s*[;,])/i,
    );
    expect(css).toMatch(/\.workbench-layout\s*{/);
    expect(css).toMatch(/\.panel--controls,/);
  });
});
