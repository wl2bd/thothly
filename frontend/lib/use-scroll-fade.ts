import {
  useEffect,
  useState,
  type CSSProperties,
  type DependencyList,
  type RefObject,
} from "react";

// How much of each edge dissolves to transparent.
const FADE = "2rem";

// Soft-fade the top and/or bottom edge of a scroll container, but ONLY the edge
// that actually has hidden content — a list that fits (or is scrolled hard to
// one end) never dims a fully-visible row. Returns a CSS mask to spread on the
// scrolling element, or undefined when neither edge needs fading.
//
// Pass { top: false } where a sticky header already masks the top (so its rows
// vanish under an opaque header rather than fading through it).
//
// `deps` re-measures when the content changes height without the element's own
// box resizing — filtering, collapsing, async-loaded content — which a
// ResizeObserver alone misses, since it watches the box, not the scrollHeight.
export function useScrollFade(
  ref: RefObject<HTMLElement | null>,
  { top = true, bottom = true }: { top?: boolean; bottom?: boolean } = {},
  deps: DependencyList = [],
): CSSProperties | undefined {
  const [edges, setEdges] = useState({ top: false, bottom: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      setEdges({ top: false, bottom: false });
      return;
    }
    const measure = () => {
      const above = el.scrollTop > 1;
      const below = el.scrollHeight - el.scrollTop - el.clientHeight > 1;
      setEdges((prev) =>
        prev.top === above && prev.bottom === below
          ? prev
          : { top: above, bottom: below },
      );
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);

  const fadeTop = top && edges.top;
  const fadeBottom = bottom && edges.bottom;
  if (!fadeTop && !fadeBottom) return undefined;

  // One gradient covers both edges: an edge that isn't fading just stays opaque
  // at its end stop, so the same expression serves top-only, bottom-only, both.
  const mask = `linear-gradient(to bottom, ${
    fadeTop ? "transparent" : "#000"
  } 0, #000 ${FADE}, #000 calc(100% - ${FADE}), ${
    fadeBottom ? "transparent" : "#000"
  } 100%)`;
  return { maskImage: mask, WebkitMaskImage: mask };
}
