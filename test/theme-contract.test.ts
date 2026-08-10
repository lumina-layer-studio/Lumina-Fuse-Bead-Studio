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
});
