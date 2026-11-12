// Nepal fork: hosting shims so upstream code runs unchanged on GitHub Pages.
//
// 1. Sub-path: the site lives at /nepal-institutions/, but upstream fetches root-relative URLs
//    ("/vdem/NPL.json"). Any such fetch is prefixed with Vite's BASE_URL. No-op when BASE_URL is "/".
//
// 2. Parquet over gzip: GitHub Pages gzips application/octet-stream on the fly and answers HTTP Range
//    requests against the *compressed* bytes. hyparquet reads parquet via HEAD + Range requests, so it
//    receives gzip fragments and throws "invalid parquet file". We can't turn compression off on Pages,
//    so for *.parquet we fetch the whole file once (the browser transparently decompresses it), cache it,
//    and answer HEAD / Range requests from memory. Files are small (largest ~5 MB).
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const originalFetch = window.fetch.bind(window);
const parquetCache = new Map<string, Promise<ArrayBuffer>>();

function withBase(url: string): string {
  if (base && url.startsWith("/") && !url.startsWith("//") && !url.startsWith(base + "/")) return base + url;
  return url;
}

function wholeFile(url: string): Promise<ArrayBuffer> {
  let p = parquetCache.get(url);
  if (!p) {
    p = originalFetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
    p.catch(() => parquetCache.delete(url));
    parquetCache.set(url, p);
  }
  return p;
}

function parseRange(header: string | null, size: number): [number, number] | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;
  if (m[1] === "") return [Math.max(0, size - Number(m[2])), size - 1]; // suffix: bytes=-N
  const start = Number(m[1]);
  const end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  return [start, end];
}

async function parquetFetch(url: string, init?: RequestInit): Promise<Response> {
  const buf = await wholeFile(url);
  const size = buf.byteLength;
  const method = (init?.method ?? "GET").toUpperCase();
  if (method === "HEAD") {
    return new Response(null, { status: 200, headers: { "Content-Length": String(size) } });
  }
  const range = parseRange(new Headers(init?.headers).get("Range"), size);
  if (!range) return new Response(buf.slice(0), { status: 200, headers: { "Content-Length": String(size) } });
  const [start, end] = range;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${size}` },
  });
}

window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  if (typeof input === "string") {
    input = withBase(input);
    if (/\.parquet(\?|$)/.test(input)) {
      return parquetFetch(input, init).catch(() => originalFetch(input, init));
    }
  }
  return originalFetch(input, init);
};

export {};
