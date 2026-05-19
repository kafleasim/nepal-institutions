import { useEffect, useMemo, useRef, useState } from "react";
import type { Country } from "../types";

type Props = {
  countries: Country[];
  value: string | null;            // selected ISO3
  exclude?: string[];              // ISO3s to omit (e.g. already-pinned peers)
  placeholder?: string;
  onChange: (iso3: string) => void;
};

export function CountryPicker({
  countries,
  value,
  exclude = [],
  placeholder = "Select country…",
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => countries.find((c) => c.iso3 === value) ?? null,
    [countries, value],
  );

  const filtered = useMemo(() => {
    const ex = new Set(exclude);
    const q = query.trim().toLowerCase();
    return countries
      .filter((c) => !ex.has(c.iso3))
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.iso3.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [countries, exclude, query]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className="flex w-full items-center justify-between rounded border border-gl-border bg-white px-3 py-2 text-left text-sm hover:border-gl-blue focus:border-gl-blue focus:outline-none"
      >
        <span className={selected ? "" : "text-gl-muted"}>
          {selected ? selected.name : placeholder}
        </span>
        <span className="text-gl-muted text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full rounded border border-gl-border bg-white shadow-lg">
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full border-b border-gl-border px-3 py-2 text-sm focus:outline-none"
          />
          <ul className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-sm text-gl-muted">No matches.</li>
            )}
            {filtered.map((c) => (
              <li key={c.iso3}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c.iso3);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-gl-bg ${
                    c.iso3 === value ? "bg-gl-bg font-medium" : ""
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="font-mono text-xs text-gl-muted">
                    {c.iso3}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
