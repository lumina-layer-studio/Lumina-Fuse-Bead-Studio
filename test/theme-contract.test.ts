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
      /\.bead-editor-workspace__magnifier\s*{[^}]*right:\s*calc\(var\(--bead-editor-right-dock\)\s*\+\s*24px\);[^}]*bottom:\s*100px;/,
    );
    expect(floatingWorkspace).toMatch(
      /@container\s+bead-editor-workspace\s*\(max-width:\s*900px\)[\s\S]*?\.bead-editor-workspace\[data-mobile-drawer="closed"\]\s+\.bead-editor-workspace__magnifier\s*{[^}]*bottom:\s*148px;/,
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

  it("lets the editor fill the iframe while keeping scrolling inside its docks", async () => {
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
    expect(css).toMatch(
      /\.bead-editor-dock__body\s*{[^}]*overflow-y:\s*auto\s*;/,
    );
    expect(css).not.toMatch(
      /\.print-mapping-list\s*{[^}]*overflow:\s*auto\s*;/,
    );
    expect(css).toMatch(
      /\.bead-editor-dock\s*{[^}]*top:\s*68px\s*;[^}]*bottom:\s*var\(--bead-editor-dock-gap\)\s*;/,
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
    const compactHeaderStart = css.indexOf(
      "@container bead-editor-workspace (max-width: 1100px)",
    );
    const mobileDrawerStart = css.indexOf(
      "@container bead-editor-workspace (max-width: 900px)",
    );
    expect(compactHeaderStart).toBeGreaterThanOrEqual(0);
    expect(mobileDrawerStart).toBeGreaterThan(compactHeaderStart);
    const compactHeaderCss = css.slice(
      compactHeaderStart,
      mobileDrawerStart,
    );
    expect(compactHeaderCss).toMatch(
      /\.bead-editor-workspace__views\s*{[^}]*top:\s*68px\s*;/,
    );
    expect(compactHeaderCss).toMatch(
      /\.bead-editor-workspace__canvas\s*>\s*\.canvas-stage\s*{[^}]*padding-top:\s*124px\s*;/,
    );
    const narrowPhoneStart = css.indexOf(
      "@container bead-editor-workspace (max-width: 520px)",
    );
    expect(narrowPhoneStart).toBeGreaterThan(mobileDrawerStart);
    const narrowPhoneCss = css.slice(
      narrowPhoneStart,
      css.indexOf("/* end bead editor floating workspace */"),
    );
    expect(narrowPhoneCss).toMatch(
      /\.bead-editor-workspace__magnifier\s*{[^}]*display:\s*none\s*;/,
    );
  });
});
