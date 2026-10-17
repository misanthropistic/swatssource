/* The first statement of the app bundle — imports resolve before it, React
 * renders after it — and it lives in a bundle file rather than an inline
 * <script> in index.html: the Content-Security-Policy the site is served with
 * allows scripts from 'self' and nothing else, and an inline handler would need
 * either 'unsafe-inline' (which would give away the whole point) or a hash that
 * silently breaks the app the moment the snippet is reworded.
 *
 * The handler itself swallows one specific Chrome quirk: a DataCloneError from
 * PerformanceServerTiming when devtools is open, which is noise a visitor can
 * only report as a scary console error.
 */
window.addEventListener(
  "error",
  (e) => {
    if (
      e.error instanceof DOMException &&
      e.error.name === "DataCloneError" &&
      e.message &&
      e.message.includes("PerformanceServerTiming")
    ) {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import "@/effects.css";
import App from "@/App";
import { applyRounding } from "@/lib/appearance";

/* The rounding preference is applied before the first paint of the app, so a
   chosen radius never flashes the default. */
applyRounding();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
