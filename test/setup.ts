import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

if (typeof window.PointerEvent !== "function") {
  Object.defineProperty(window, "PointerEvent", {
    configurable: true,
    value: window.MouseEvent,
  });
}

if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:test";
}

if (typeof URL.revokeObjectURL !== "function") {
  URL.revokeObjectURL = () => undefined;
}
