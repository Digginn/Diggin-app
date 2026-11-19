import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ComponentPreview } from "./ComponentPreview";
import "./theme/tokens.css";
import "./components/components.css";
import "./preview.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ComponentPreview />
  </StrictMode>,
);
