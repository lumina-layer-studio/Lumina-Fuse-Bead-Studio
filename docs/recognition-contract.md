# Recognition contract

Fuse Bead Studio v1 accepts clear pattern charts and screenshots. It is an
analysis and correction tool, not a general photograph-to-pixel-art converter.
Every automatic result remains editable.

## Supported evidence

### Numbered grids

- Grid geometry is estimated from repeated horizontal and vertical structure.
- Occupancy and source color are evaluated separately.
- Dark grid lines, high-gradient number strokes, coordinate labels, and other
  overlays are excluded from color sampling where possible.
- Color samples favor cell corners and low-gradient pixels instead of assuming
  the cell center is representative.
- White beads on white backgrounds are recoverable only when grid, alpha, or
  other occupancy evidence remains. Otherwise the affected cells are reported
  for manual review.

### Hard-pixel charts

- Integer-size pixel runs are detected and calibrated as a square grid.
- Transparent pixels remain distinct from opaque empty/background cells.
- If foreground and background pixels are byte-identical, the lost information
  is reported instead of being invented from neighboring cells.

### Ring or bead previews

- Color is sampled from the bead annulus.
- The center hole is excluded from color sampling.
- Empty cells and transparent support cells remain distinct.

## Confidence and unsupported inputs

- Watermarks, noise, JPEG artifacts, or text overlays are never silently erased
  or “repaired” from neighbors.
- Near ties, high variance, geometry drift, and occupancy/color conflicts become
  explicit low-confidence cells that the user can navigate and correct.
- Perspective photographs, lighting correction, OCR, non-square grids, oblique
  grids, and brand-specific bead-code mapping are unsupported in v1. They must
  return a visible manual-calibration or unsupported result, never a falsely
  confident matrix.
- Cropping is user-controlled when one image contains multiple patterns,
  legends, titles, or unrelated page content.

The repository uses deterministic generated fixtures rather than checking
third-party artwork, charts, watermarks, or screenshots into source control.
