import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./utils/errors";
import "./index.css";

installGlobalErrorHandlers();

// Iedere page-load begint bij de splash, ongeacht waar de hash heen wees.
// Bookmarks blijven werken: gebruiker tapt "start" en de splash kiest dan
// de juiste vervolgroute (home / clubs / onboard).
if (typeof window !== "undefined" && window.location.hash !== "#/") {
  window.location.hash = "/";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
