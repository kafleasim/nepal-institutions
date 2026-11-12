#!/usr/bin/env node
// Nepal fork: download the data folders that upstream keeps out of git (see repo .gitignore and
// README "Deployment": regimes/, vdem-codebook/, research/ are rsynced to Taimur's server, not committed).
// We pull them from the live upstream site at build time. Files that already exist in public/ are
// NEVER overwritten, so anything we commit ourselves (e.g. Nepal-specific data) takes precedence.
//
// Usage (from apps/country-profile):  node scripts/fetch-upstream-data.mjs [baseUrl]
// Default baseUrl: https://institutions.taimur.sh   — no dependencies, Node >= 18.

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] ?? "https://institutions.taimur.sh").replace(/\/$/, "");
const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const CONCURRENCY = 12;

const RESEARCH = [
  "annual_membership.parquet", "cluster_meta.json", "cx_annual.parquet", "cx_country.parquet",
  "cx_meta.json", "cx_pairs.parquet", "cx_rca.parquet", "entries.json", "events_meta.json",
  "indicator_screen.parquet", "indicator_screen_meta.json", "mechanisms.json", "null_meta.json",
  "null_products.parquet", "points.parquet", "profiles.parquet", "subregions.json", "tilt.parquet",
  "tilt_z.parquet", "tree_k6.json", "within_panel.parquet", "within_results.json",
].map((f) => `research/${f}`);

const exists = (p) => access(p).then(() => true, () => false);
const stats = { downloaded: 0, kept: 0, missing: 0, failed: 0 };

async function get(rel, { optional = false } = {}) {
  const dest = join(PUBLIC, rel);
  if (await exists(dest)) { stats.kept++; return readFile(dest); }
  // Ask for identity encoding so binary files arrive byte-exact.
  const res = await fetch(`${BASE}/${rel}`, { headers: { "Accept-Encoding": "identity" } });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || type.startsWith("text/html")) {
    if (res.status === 404 || type.startsWith("text/html")) {
      stats.missing++;
      if (!optional) console.warn(`  missing upstream: ${rel}`);
      return null;
    }
    stats.failed++;
    throw new Error(`${rel}: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf);
  stats.downloaded++;
  return buf;
}

async function pool(items, fn) {
  let i = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

const countries = JSON.parse(await readFile(join(PUBLIC, "countries.json"), "utf8"));

console.log(`Fetching upstream data from ${BASE} into public/ (existing files kept)`);

// Regimes section of the country profile: meta + one file per country (some countries have none).
await get("regimes/meta.json");
await pool(countries.map((c) => `regimes/${c.iso3}.json`), (rel) => get(rel, { optional: true }));

// V-Dem codebook explorer (/vdem): index + one gzipped file per variable.
const idx = await get("vdem-codebook/index.json");
if (idx) {
  const vars = JSON.parse(idx.toString("utf8")).variables;
  await pool(vars.map((v) => `vdem-codebook/vars/${v.tag}.json.gz`), (rel) => get(rel, { optional: true }));
}

// Research page (/research).
await pool(RESEARCH, (rel) => get(rel));

console.log(`Done: ${stats.downloaded} downloaded, ${stats.kept} kept (already present), ` +
  `${stats.missing} not on upstream, ${stats.failed} failed.`);
if (stats.failed) process.exit(1);
