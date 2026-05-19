import { useEffect, useState } from "react";

export type ChapterSpec = { id: string; label: string };

type Props = {
  chapters: ChapterSpec[];
};

export function SectionNav({ chapters }: Props) {
  const [active, setActive] = useState<string>(chapters[0]?.id ?? "");

  useEffect(() => {
    // Active = the last chapter whose top has scrolled past the trigger
    // line just below the sticky nav. Reliable across smooth-scroll, jump
    // scroll, and section heights bigger than the viewport.
    const TRIGGER = 120;
    const update = () => {
      let activeId = chapters[0]?.id ?? "";
      for (const c of chapters) {
        const el = document.getElementById(c.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= TRIGGER) activeId = c.id;
      }
      setActive(activeId);
    };
    update();
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    // The actual scrolling element is the AppShell's overflow-auto wrapper,
    // not window. Capture-phase catches scroll events on any descendant.
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [chapters]);

  return (
    <nav className="sticky top-0 z-30 -mx-6 mb-8 border-b border-gl-border bg-white/95 px-6 py-2 backdrop-blur">
      <ul className="flex flex-wrap gap-1 text-xs">
        {chapters.map((c) => {
          const isActive = c.id === active;
          return (
            <li key={c.id}>
              <a
                href={`#${c.id}`}
                onClick={() => setActive(c.id)}
                className={
                  isActive
                    ? "inline-block rounded-full bg-gl-blue px-2.5 py-1 font-medium text-white"
                    : "inline-block rounded-full border border-transparent px-2.5 py-1 text-gl-muted hover:border-gl-border hover:text-gl-text"
                }
              >
                {c.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
