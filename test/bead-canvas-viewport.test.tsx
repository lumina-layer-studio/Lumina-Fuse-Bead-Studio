import {
  act,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { BeadCanvasViewport } from "../src/app/BeadCanvasViewport";
import {
  translate,
  type Locale,
} from "../src/i18n/translations";

class ResizeObserverStub implements ResizeObserver {
  static instances: ResizeObserverStub[] = [];

  readonly observe = vi.fn();
  readonly unobserve = vi.fn();
  readonly disconnect = vi.fn();

  constructor(private readonly callback: ResizeObserverCallback) {
    ResizeObserverStub.instances.push(this);
  }

  trigger(): void {
    this.callback([], this);
  }
}

function rectangle({
  width,
  height,
  left = 0,
  top = 0,
}: {
  width: number;
  height: number;
  left?: number;
  top?: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    top,
    right: left + width,
    bottom: top + height,
    left,
    width,
    height,
    toJSON: () => undefined,
  } as DOMRect;
}

let surfaceRectangle = rectangle({ width: 800, height: 600 });

function translator(locale: Locale) {
  return (key: string) => translate(locale, key);
}

function renderViewport({
  contentWidth = 1_000,
  contentHeight = 500,
  viewKey = "matrix",
  locale = "zh-CN",
  onChildPointerDown,
}: {
  contentWidth?: number;
  contentHeight?: number;
  viewKey?: string;
  locale?: Locale;
  onChildPointerDown?: React.PointerEventHandler<HTMLButtonElement>;
} = {}) {
  return render(
    <BeadCanvasViewport
      contentWidth={contentWidth}
      contentHeight={contentHeight}
      viewKey={viewKey}
      ariaLabel="拼豆二维画布"
      translate={translator(locale)}
    >
      <button
        type="button"
        data-testid="canvas-child"
        onPointerDown={onChildPointerDown}
      >
        格子
      </button>
    </BeadCanvasViewport>,
  );
}

function contentLayer(): HTMLElement {
  return screen.getByTestId("bead-canvas-viewport-content");
}

describe("BeadCanvasViewport", () => {
  beforeEach(() => {
    ResizeObserverStub.instances = [];
    surfaceRectangle = rectangle({ width: 800, height: 600 });
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(function getBoundingClientRect(
      this: HTMLElement,
    ) {
      if (
        this.getAttribute("data-testid") ===
        "bead-canvas-viewport-surface"
      ) {
        return surfaceRectangle;
      }
      return rectangle({ width: 0, height: 0 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("fits and centers the intrinsic content on its first layout", () => {
    renderViewport();

    expect(
      screen.getByRole("region", { name: "拼豆二维画布" }),
    ).toBeInTheDocument();
    expect(contentLayer()).toHaveStyle({
      width: "1000px",
      height: "500px",
      transformOrigin: "0 0",
      transform: "translate3d(0px, 100px, 0) scale(0.8)",
    });
    expect(screen.getByRole("status")).toHaveTextContent("80%");
    expect(
      ResizeObserverStub.instances[0]?.observe,
    ).toHaveBeenCalledWith(
      screen.getByTestId("bead-canvas-viewport-surface"),
    );
  });

  it("allows fit below the 25% manual zoom floor for very large content", () => {
    surfaceRectangle = rectangle({ width: 700, height: 500 });
    renderViewport({ contentWidth: 4_000, contentHeight: 3_000 });

    expect(contentLayer()).toHaveStyle({
      transform:
        "translate3d(16.666667px, 0px, 0) scale(0.16666666666666666)",
    });
    expect(screen.getByRole("status")).toHaveTextContent("17%");
    expect(screen.getByRole("button", { name: "缩小" })).toBeDisabled();

    const surface = screen.getByTestId("bead-canvas-viewport-surface");
    const wheelOut = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 350,
      clientY: 250,
      deltaY: 100,
    });
    act(() => surface.dispatchEvent(wheelOut));
    expect(screen.getByRole("status")).toHaveTextContent("17%");
    expect(contentLayer()).toHaveStyle({
      transform:
        "translate3d(16.666667px, 0px, 0) scale(0.16666666666666666)",
    });

    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 350,
      clientY: 250,
      deltaY: -100,
    });
    act(() => surface.dispatchEvent(wheel));

    expect(screen.getByRole("status")).toHaveTextContent("25%");
  });

  it("recomputes fit and centering whenever the observed surface changes", () => {
    renderViewport();
    surfaceRectangle = rectangle({ width: 400, height: 300 });

    act(() => {
      ResizeObserverStub.instances[0]?.trigger();
    });

    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(0px, 50px, 0) scale(0.4)",
    });
    expect(screen.getByRole("status")).toHaveTextContent("40%");
  });

  it("re-fits when the intrinsic content dimensions change", () => {
    const view = renderViewport();

    view.rerender(
      <BeadCanvasViewport
        viewKey="matrix"
        contentWidth={400}
        contentHeight={400}
        ariaLabel="拼豆二维画布"
        translate={translator("zh-CN")}
      >
        <div>新画布</div>
      </BeadCanvasViewport>,
    );

    expect(contentLayer()).toHaveStyle({
      width: "400px",
      height: "400px",
      transform: "translate3d(100px, 0px, 0) scale(1.5)",
    });
    expect(screen.getByRole("status")).toHaveTextContent("150%");
  });

  it("keeps toolbar zoom between 25% and 400% and resets to 100%", () => {
    surfaceRectangle = rectangle({ width: 100, height: 100 });
    renderViewport({ contentWidth: 100, contentHeight: 100 });
    const zoomOut = screen.getByRole("button", { name: "缩小" });
    const zoomIn = screen.getByRole("button", { name: "放大" });

    fireEvent.click(zoomOut);
    fireEvent.click(zoomOut);
    fireEvent.click(zoomOut);

    expect(screen.getByRole("status")).toHaveTextContent("25%");
    expect(zoomOut).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "重置为 100%" }),
    );
    expect(screen.getByRole("status")).toHaveTextContent("100%");

    for (let click = 0; click < 12; click += 1) {
      fireEvent.click(zoomIn);
    }

    expect(screen.getByRole("status")).toHaveTextContent("400%");
    expect(zoomIn).toBeDisabled();
  });

  it("centers content when resetting to 100% after it was panned", () => {
    renderViewport({ contentWidth: 400, contentHeight: 200 });
    const surface = screen.getByTestId("bead-canvas-viewport-surface");

    fireEvent.pointerDown(surface, {
      button: 1,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(surface, { clientX: 260, clientY: 235 });
    fireEvent.pointerUp(surface, { button: 1, clientX: 260, clientY: 235 });
    fireEvent.click(
      screen.getByRole("button", { name: "重置为 100%" }),
    );

    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(200px, 200px, 0) scale(1)",
    });
  });

  it("restores the current fit after manual zoom and pan", () => {
    renderViewport();
    const surface = screen.getByTestId("bead-canvas-viewport-surface");

    fireEvent.pointerDown(surface, {
      button: 1,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(surface, { clientX: 260, clientY: 235 });
    fireEvent.pointerUp(surface, { button: 1, clientX: 260, clientY: 235 });
    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    fireEvent.click(
      screen.getByRole("button", { name: "适合窗口" }),
    );

    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(0px, 100px, 0) scale(0.8)",
    });
    expect(screen.getByRole("status")).toHaveTextContent("80%");
  });

  it("zooms around the wheel pointer and prevents the page wheel default", () => {
    surfaceRectangle = rectangle({
      width: 800,
      height: 600,
      left: 100,
      top: 50,
    });
    renderViewport({ contentWidth: 800, contentHeight: 600 });
    const surface = screen.getByTestId("bead-canvas-viewport-surface");
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: 300,
      clientY: 250,
      deltaY: -100,
    });

    act(() => {
      surface.dispatchEvent(wheel);
    });

    expect(wheel.defaultPrevented).toBe(true);
    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(-20px, -20px, 0) scale(1.1)",
    });
    expect(screen.getByRole("status")).toHaveTextContent("110%");
  });

  it("pans with a middle-button drag and stops panning after release", () => {
    renderViewport({ contentWidth: 800, contentHeight: 600 });
    const surface = screen.getByTestId("bead-canvas-viewport-surface");

    fireEvent.pointerDown(surface, {
      button: 1,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(surface, { clientX: 260, clientY: 235 });

    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(60px, 35px, 0) scale(1)",
    });

    fireEvent.pointerUp(surface, {
      button: 1,
      clientX: 260,
      clientY: 235,
    });
    fireEvent.pointerMove(surface, { clientX: 300, clientY: 300 });
    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(60px, 35px, 0) scale(1)",
    });
  });

  it("pans with Space plus left drag instead of sending that gesture to the child", () => {
    const childPointerDown = vi.fn();
    renderViewport({
      contentWidth: 800,
      contentHeight: 600,
      onChildPointerDown: childPointerDown,
    });
    const child = screen.getByTestId("canvas-child");
    const surface = screen.getByTestId("bead-canvas-viewport-surface");

    fireEvent.keyDown(window, { key: " ", code: "Space" });
    fireEvent.pointerDown(child, {
      button: 0,
      clientX: 120,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, { clientX: 150, clientY: 145 });
    fireEvent.pointerUp(surface, {
      button: 0,
      clientX: 150,
      clientY: 145,
    });
    fireEvent.keyUp(window, { key: " ", code: "Space" });

    expect(childPointerDown).not.toHaveBeenCalled();
    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(30px, 45px, 0) scale(1)",
    });
  });

  it("uses the pressed Pan tool for ordinary left and touch drags", () => {
    const childPointerDown = vi.fn();
    renderViewport({
      contentWidth: 800,
      contentHeight: 600,
      onChildPointerDown: childPointerDown,
    });
    const child = screen.getByTestId("canvas-child");
    const surface = screen.getByTestId("bead-canvas-viewport-surface");
    const panButton = screen.getByRole("button", { name: "平移" });

    expect(panButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(panButton);
    expect(panButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.pointerDown(child, {
      button: 0,
      pointerId: 11,
      pointerType: "mouse",
      clientX: 120,
      clientY: 100,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 11,
      pointerType: "mouse",
      clientX: 150,
      clientY: 145,
    });
    fireEvent.pointerUp(surface, {
      button: 0,
      pointerId: 11,
      pointerType: "mouse",
      clientX: 150,
      clientY: 145,
    });

    fireEvent.pointerDown(child, {
      button: 0,
      pointerId: 22,
      pointerType: "touch",
      clientX: 150,
      clientY: 145,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 22,
      pointerType: "touch",
      clientX: 170,
      clientY: 155,
    });
    fireEvent.pointerUp(surface, {
      button: 0,
      pointerId: 22,
      pointerType: "touch",
      clientX: 170,
      clientY: 155,
    });

    expect(childPointerDown).not.toHaveBeenCalled();
    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(50px, 55px, 0) scale(1)",
    });

    fireEvent.click(panButton);
    fireEvent.pointerDown(child, {
      button: 0,
      pointerId: 33,
      pointerType: "mouse",
      clientX: 200,
      clientY: 180,
    });
    expect(childPointerDown).toHaveBeenCalledTimes(1);
  });

  it("does not intercept an ordinary left pointer gesture from the child canvas", () => {
    const childPointerDown = vi.fn(
      (event: React.PointerEvent<HTMLButtonElement>) => {
        expect(event.defaultPrevented).toBe(false);
      },
    );
    renderViewport({ onChildPointerDown: childPointerDown });

    fireEvent.pointerDown(screen.getByTestId("canvas-child"), {
      button: 0,
      clientX: 120,
      clientY: 100,
    });

    expect(childPointerDown).toHaveBeenCalledTimes(1);
  });

  it("restores the transform and fit mode independently for every 2D view", () => {
    const view = renderViewport({
      viewKey: "matrix",
      contentWidth: 800,
      contentHeight: 600,
    });
    const surface = screen.getByTestId("bead-canvas-viewport-surface");

    fireEvent.pointerDown(surface, {
      button: 1,
      pointerId: 7,
      clientX: 200,
      clientY: 200,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 7,
      clientX: 260,
      clientY: 235,
    });
    fireEvent.pointerUp(surface, {
      button: 1,
      pointerId: 7,
      clientX: 260,
      clientY: 235,
    });
    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(60px, 35px, 0) scale(1)",
    });

    view.rerender(
      <BeadCanvasViewport
        viewKey="original"
        contentWidth={400}
        contentHeight={400}
        ariaLabel="拼豆二维画布"
        translate={translator("zh-CN")}
      >
        <div>原图</div>
      </BeadCanvasViewport>,
    );

    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(100px, 0px, 0) scale(1.5)",
    });
    expect(
      screen.getByRole("button", { name: "适合窗口" }),
    ).toHaveAttribute("aria-pressed", "true");

    view.rerender(
      <BeadCanvasViewport
        viewKey="matrix"
        contentWidth={800}
        contentHeight={600}
        ariaLabel="拼豆二维画布"
        translate={translator("zh-CN")}
      >
        <div>矩阵</div>
      </BeadCanvasViewport>,
    );

    expect(contentLayer()).toHaveStyle({
      transform: "translate3d(60px, 35px, 0) scale(1)",
    });
    expect(
      screen.getByRole("button", { name: "适合窗口" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps a manual view stable across resize and content-size updates", () => {
    const view = renderViewport({ contentWidth: 800, contentHeight: 600 });
    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    const manualTransform = contentLayer().style.transform;

    surfaceRectangle = rectangle({ width: 700, height: 500 });
    act(() => ResizeObserverStub.instances[0]?.trigger());
    expect(contentLayer().style.transform).toBe(manualTransform);

    view.rerender(
      <BeadCanvasViewport
        viewKey="matrix"
        contentWidth={900}
        contentHeight={700}
        ariaLabel="拼豆二维画布"
        translate={translator("zh-CN")}
      >
        <div>更新矩阵</div>
      </BeadCanvasViewport>,
    );
    expect(contentLayer().style.transform).toBe(manualTransform);
  });

  it("disconnects observation and removes keyboard listeners on unmount", () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const view = renderViewport();
    const addedListeners = addEventListener.mock.calls as unknown as Array<
      [string, EventListenerOrEventListenerObject]
    >;
    const keydownListener = addedListeners.find(
      ([type]) => type === "keydown",
    )?.[1];
    const keyupListener = addedListeners.find(
      ([type]) => type === "keyup",
    )?.[1];

    expect(keydownListener).toBeDefined();
    expect(keyupListener).toBeDefined();
    view.unmount();

    expect(
      ResizeObserverStub.instances[0]?.disconnect,
    ).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith(
      "keydown",
      keydownListener,
    );
    expect(removeEventListener).toHaveBeenCalledWith(
      "keyup",
      keyupListener,
    );
  });

  it("exposes translated toolbar controls and a live zoom status", () => {
    const view = renderViewport();

    expect(
      screen.getByRole("toolbar", { name: "画布缩放" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "缩小" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "重置为 100%" }),
    ).toHaveTextContent("100%");
    expect(
      screen.getByRole("button", { name: "放大" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "适合窗口" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "平移" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "当前缩放：80%",
    );

    view.rerender(
      <BeadCanvasViewport
        viewKey="matrix"
        contentWidth={1_000}
        contentHeight={500}
        ariaLabel="2D bead canvas"
        translate={translator("en-US")}
      >
        <div>canvas</div>
      </BeadCanvasViewport>,
    );

    expect(
      screen.getByRole("toolbar", { name: "Canvas zoom" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zoom out" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset to 100%" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Zoom in" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Fit to window" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pan" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "Current zoom: 80%",
    );
  });

  it("floats a centered bottom capsule without taking height from the canvas", () => {
    renderViewport();

    expect(screen.getByTestId("bead-canvas-viewport")).toHaveClass(
      "bead-canvas-viewport",
    );
    expect(screen.getByTestId("bead-canvas-viewport")).toHaveStyle({
      position: "relative",
    });
    expect(
      screen.getByTestId("bead-canvas-viewport-surface"),
    ).toHaveClass("bead-canvas-viewport__surface");
    expect(
      screen.getByTestId("bead-canvas-viewport-surface"),
    ).toHaveStyle({
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
    });
    expect(
      screen.getByRole("toolbar", { name: "画布缩放" }),
    ).toHaveClass("bead-canvas-viewport__toolbar");
    expect(
      screen.getByTestId("bead-canvas-viewport-content"),
    ).toHaveClass("bead-canvas-viewport__content");
    const toolbar = screen.getByRole("toolbar", { name: "画布缩放" });
    expect(toolbar).toHaveStyle({
      position: "absolute",
      bottom: "12px",
      left: "50%",
      justifyContent: "flex-start",
      transform: "translateX(-50%)",
    });
    expect(toolbar.style.border).toBe(
      "1px solid var(--bead-border)",
    );
    expect(toolbar.style.borderRadius).toBe("999px");
    expect(toolbar.style.boxShadow).toBe("var(--bead-shadow)");
    expect(toolbar.style.whiteSpace).toBe("nowrap");
  });
});
