import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function LoadingScreen() {
  return <main>拼豆工作台正在连接 Lumina…</main>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LoadingScreen />
  </StrictMode>,
);
