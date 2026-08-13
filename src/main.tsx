import { createRoot } from "react-dom/client";

import { ModuleEntry } from "./app/ModuleEntry";
import "./ui/theme.css";

createRoot(document.getElementById("root")!).render(
  <ModuleEntry />,
);
