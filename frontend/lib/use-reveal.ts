import { useEffect, useRef, useState, type RefObject } from "react";

// A one-shot scroll-into-view reveal. Returns a ref to attach to the element and
// a `shown` flag that flips true the first time the element enters the viewport,
// then never flips back — the entrance plays once and rests (no perpetual
// motion).
//
// `shown` starts TRUE, so the server render and any no-JS / headless render show
// the final, visible state — the reveal only ever ENHANCES an already-visible
// default, it never gates content on a transition that could leave the section
// blank. JS re-arms the hidden start (`shown = false`) only after it has
// confirmed three things: motion is allowed, IntersectionObserver exists, and
// the element is currently OFF screen (so arming it can never flash content that
// the user is already looking at). Under reduced motion it stays shown, instant.
export function useReveal<T extends HTMLElement>(): {
  ref: RefObject<T | null>;
  shown: boolean;
} {
  const ref = useRef<T>(null);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return; // stay shown

    // Already on screen at mount (fast scroll, deep link to the section): treat
    // it as already revealed rather than yanking it back to replay the entrance.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;

    setShown(false);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, shown };
}
