import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./theme/tokens.css";
import "./components/components.css";
import "./preview.css";
import "./screens/screens.css";
import "./design-index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
