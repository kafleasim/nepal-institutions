// Nepal fork: lets the app run under a sub-path (e.g. GitHub Pages at /nepal-institutions/)
// without rewriting every absolute data URL in upstream code. Any fetch of a root-relative
// path ("/vdem/NPL.json") is prefixed with Vite's BASE_URL. hyparquet's asyncBufferFromUrl
// uses the global fetch, so parquet loads are covered too. No-op when BASE_URL is "/".
const base = import.meta.env.BASE_URL.replace(/\/$/, "");

if (base) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/") && !input.startsWith("//") && !input.startsWith(base + "/")) {
      input = base + input;
    }
    return originalFetch(input, init);
  };
}

export {};
