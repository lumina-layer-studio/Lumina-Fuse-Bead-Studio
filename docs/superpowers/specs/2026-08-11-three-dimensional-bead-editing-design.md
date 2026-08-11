# 3D Bead Editing Design

Date: 2026-08-11
Status: Approved in product discussion

## Goal

Make the existing paint, erase, connected-area erase, eyedropper, and fill tools usable directly in the 3D preview without duplicating editor business logic or resetting the user's camera.

## Scope

- Reuse the existing `apply-tool` reducer path, active tool, palette selection, history, selected cell, and magnifier.
- Add only the missing bridge from a 3D canvas pointer position to a logical `cellIndex`.
- Keep the canonical fused SVG, printable geometry, physical dimensions, project schema, and Lumina handoff unchanged.
- Keep the existing explicit 2D fallback when WebGL is unavailable or the 3D bead-count safety limit is exceeded.

## Interaction Contract

The 3D preview opens in edit mode.

- Primary mouse button: use the active tool.
- Paint and erase: apply on pointer down and continuously across newly crossed cells while dragging. A cell is applied at most once per uninterrupted gesture.
- Connected-area erase, eyedropper, and fill: apply once after a completed click and never sweep while dragging.
- Right drag or `Alt + primary drag`: rotate the camera.
- Middle drag: pan the camera.
- Mouse wheel: zoom.
- Touch edit mode: one finger uses the active tool.
- Touch view mode: the bottom 3D toolbar exposes an Edit/View toggle; in View mode OrbitControls receives normal one- and two-finger navigation gestures and tools are suspended.
- Pointer cancellation, lost capture, a second editing pointer, or switching interaction modes cancels the current edit gesture without leaving stale drag state.

The target cell is shown immediately with a preview-only outline. The selected-cell feedback remains visible while the exact fused surface catches up asynchronously. Preview markers never enter SVG, print, or handoff output.

## Architecture

`BeadEditorStep` remains the sole coordinator. It passes the same `applyAt`, `allowDrag`, and selected-cell state to the matrix and 3D previews. `BeadThreePreview` owns pointer gesture arbitration and keeps callback refs current so changing tools or palettes does not recreate the WebGL controller.

The controller exposes an O(1) cell-picking operation. It casts the pointer ray onto a virtual horizontal editing work plane and converts the hit's X/Z coordinates to row and column using the current pitch, rows, and columns. This deliberately does not raycast the large fused surface or thousands of peg instances, so empty cells and center holes remain selectable and pointer movement stays cheap. Hits in the pegboard margin or outside the logical grid return no cell.

The existing renderer, scene, camera, controls, board, and current fused surface remain mounted. Editing updates may replace the finished fused surface later, but must not reset camera position, target, orientation, zoom, or interaction mode.

## Failure and Boundary Behavior

- Before the controller has a valid model or canvas size, picking returns no cell.
- WebGL context loss and controller/Worker failures retain the existing SVG fallback behavior.
- The explicit over-limit 2D fallback remains non-3D; its current limit message continues to explain why 3D interaction is unavailable.
- Context-menu display is suppressed only inside the interactive 3D canvas so right-drag rotation is reliable.

## Verification

Automated tests must prove:

1. A 3D pick dispatches `apply-tool` with the latest active tool and palette, using the same reducer behavior as the matrix view.
2. Paint/erase dragging deduplicates cells; fill, connected-area erase, and eyedropper execute once.
3. Right, middle, Alt-navigation, wheel, touch View mode, cancellation, and multi-pointer transitions never apply a tool accidentally.
4. Top view, rotated view, resized/offset canvas, empty cells, center holes, all four grid corners, and board-margin misses map correctly.
5. Tool, palette, selected cell, and callback changes do not recreate the controller, renderer, canvas, or camera.
6. Cell additions/removals and fused-surface topology changes preserve the camera and still use the latest-only surface-render queue.

Real-browser acceptance uses the 64 x 69 sample: edit empty and occupied cells from top and angled views, sweep paint/erase across at least 100 cells, exercise every one-shot tool, verify right/middle/Alt navigation, and confirm immediate cell feedback with no camera jump or unintended page scrolling.
