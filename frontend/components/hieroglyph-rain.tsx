"use client";

import { useEffect, useRef, useState } from "react";

// A glyph rain for the hero's night ground — Thothly's nod to Thoth, the scribe
// god: the raw matter of writing (ancient hieroglyphs and Latin letters) falling
// in desert gold, the way scattered sources fall in to be bound into a book.
//
// Adapted down from a Matrix-style "digital rain" to a *background texture*: the
// falling columns are kept; the water surface, ripples, reflections and pointer
// interaction of the original scene are dropped. It runs in BOTH modes, with the
// tone inverted per ground: on the night ground the lead glyph is a warm
// white-hot fading to desert gold; on the light page the ramp flips, a deep gold
// lead fading UP to a light gold that dissolves into the off-white, so the same
// motif reads on either canvas. Decorative only: aria-hidden, pointer-events
// none, paused when off-screen or on a hidden tab, and reduced to a single still
// frame under prefers-reduced-motion.
//
// The hieroglyph block (U+13000–U+1342E) is contiguous and fully covered by Noto
// Sans Egyptian Hieroglyphs, loaded (self-hosted) via next/font and read off the
// `--font-hieroglyph` CSS variable so the canvas paints real glyphs, never tofu.

// A spread across the hieroglyph block — stepped so consecutive Gardiner variants
// don't repeat — plus the Latin alphabet. Hieroglyph-dominant (~2:1) by design.
const HIEROGLYPHS = Array.from({ length: 56 }, (_, i) =>
  String.fromCodePoint(0x13000 + i * 0x11),
);
const LETTERS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".split("");
// Hieroglyph-dominant (~2:1): the glyphs are counted twice so the letters — now
// a mix of upper and lower case — stay the same ~third of the rain as before,
// just no longer all-caps.
const GLYPHS = [...HIEROGLYPHS, ...HIEROGLYPHS, ...LETTERS];

const GLYPH_SIZE = 30; // large, zoomed-in glyphs
// In the ruled-inscription layout every glyph is one size (hieroglyphs and
// letters alike), the way an Egyptian column reads. Drop the ratio below 1 to
// shrink the Latin letters again if they should recede.
const LETTER_SIZE = GLYPH_SIZE;
// The ruled corridors: each falling column lives between two faint gold rules
// (the "filets" of a stela). Lines sit on the corridor boundaries; glyphs fall
// centered between them, so nothing overlaps a rule. The rules are ERODED like
// the stone-tablet rim, not a clean sine: three sine octaves are summed (a long
// waver + medium roughness + a fine chiselled grain) to give a hand-hewn,
// irregular edge — the canvas equivalent of the tablets' feTurbulence rim, which
// can't be applied as a filter here without distorting the glyphs too. Tune the
// amplitudes for how chewed-up the line reads.
const SEP_OCTAVES = [
  { a: 3.6, w: 115 }, // the overall sinuous waver
  { a: 1.9, w: 40 }, // medium erosion
  { a: 0.9, w: 15 }, // fine chiselled grain
];
// Horizontal spacing between columns. Twice the glyph size = half as many
// columns as a packed grid — the main lever on how much the rain costs per
// frame (fewer columns → fewer glyphs drawn).
const COLUMN_STEP = GLYPH_SIZE * 2;
// Vertical advance between glyphs in a column — kept looser than the glyph size
// so tall hieroglyphs don't touch or overlap the one below.
const LINE_STEP = Math.round(GLYPH_SIZE * 1.3);
const DENSITY = 0.5; // share of columns active at any moment
const FADE_S = 0.5; // seconds to crossfade one glyph into the next

interface Cell {
  ch: string;
  prev: string | null; // the glyph being crossfaded out, while mid-transition
  t: number; // crossfade progress 0→1 (1 = fully showing `ch`)
  timer: number; // seconds until this cell flips to a new glyph
  rate: number;
}
interface Column {
  x: number;
  y: number; // y of the leading (lowest) glyph
  speed: number;
  len: number;
  cells: Cell[];
  active: boolean;
  delay: number; // seconds until an inactive column may restart
  opacity: number;
}

export function HieroglyphRain({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDark, setIsDark] = useState(false);

  // The rain is the night-ground showcase; mirror the theme class on <html>.
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(root.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let cancelled = false;
    let raf = 0;
    let last = 0;
    let width = 0;
    let height = 0;
    let columns: Column[] = [];
    // One static phase per corridor rule (columns + 1 boundaries), so each
    // sinuous line wavers on its own and the field doesn't read as a comb.
    let sepPhases: number[] = [];
    // Two faces: Noto for the hieroglyphs, the edition serif (Literata) for the
    // interspersed Latin letters. Resolved from CSS vars in the async setup.
    let hieroFont = `${GLYPH_SIZE}px monospace`;
    // Extra-light (200) serif so the letters' stroke weight sits as fine as the
    // thin single-weight hieroglyphs, instead of reading heavier than them.
    let serifFont = `200 ${LETTER_SIZE}px serif`;
    let visible = true;

    const randomGlyph = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

    function createColumn(index: number, scatter: boolean): Column {
      const len = 8 + ((Math.random() * 14) | 0);
      const cells: Cell[] = [];
      for (let j = 0; j < len + 4; j++) {
        cells.push({
          ch: randomGlyph(),
          prev: null,
          t: 1,
          timer: Math.random() * 3,
          rate: 1.2 + Math.random() * 3, // calmer glyph flips
        });
      }
      return {
        x: index * COLUMN_STEP,
        // On first paint, scatter leads across the height so the field is full
        // immediately rather than raining in from the top.
        y: scatter ? Math.random() * height : -len * LINE_STEP * Math.random() * 0.3,
        speed: 0.3 + Math.random() * 0.7, // slow, contemplative fall
        len,
        cells,
        active: Math.random() < (scatter ? DENSITY + 0.15 : DENSITY),
        delay: 0,
        opacity: 0.55 + Math.random() * 0.4,
      };
    }

    function initColumns() {
      const n = Math.max(1, Math.floor(width / COLUMN_STEP));
      const next: Column[] = [];
      for (let i = 0; i < n; i++) {
        const existing = columns[i];
        if (existing) {
          existing.x = i * COLUMN_STEP;
          next.push(existing);
        } else {
          next.push(createColumn(i, true));
        }
      }
      columns = next;
      // A rule sits on every corridor boundary (left of col 0 … right of the
      // last), so n columns need n+1 lines. Phases are kept stable across
      // resizes that don't change the count.
      if (sepPhases.length !== n + 1) {
        sepPhases = Array.from(
          { length: n + 1 },
          () => Math.random() * Math.PI * 2,
        );
      }
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      initColumns();
    }

    function update(dt: number) {
      for (const col of columns) {
        if (!col.active) {
          col.delay -= dt;
          if (col.delay <= 0) {
            if (Math.random() < DENSITY) {
              col.active = true;
              col.y = -col.len * LINE_STEP * Math.random() * 0.3;
              col.speed = 0.3 + Math.random() * 0.7;
              col.len = 8 + ((Math.random() * 14) | 0);
              col.opacity = 0.55 + Math.random() * 0.4;
              for (const cell of col.cells) {
                cell.ch = randomGlyph();
                cell.prev = null;
                cell.t = 1;
              }
            } else {
              col.delay = 0.3 + Math.random() * 1.5;
            }
          }
          continue;
        }
        col.y += col.speed * dt * 60;
        for (const cell of col.cells) {
          cell.timer -= dt;
          if (cell.timer <= 0) {
            cell.prev = cell.ch; // start dissolving the old glyph into the new
            cell.ch = randomGlyph();
            cell.t = 0;
            cell.timer = cell.rate;
          }
          if (cell.t < 1) cell.t = Math.min(1, cell.t + dt / FADE_S);
        }
        if (col.y - col.len * LINE_STEP > height + 30) {
          col.active = false;
          col.delay = 0.2 + Math.random() * 2;
        }
      }
    }

    // The faint eroded gold rules between the falling corridors — a stela's
    // hand-hewn ruling, drawn behind the glyphs. Static (the octave phases per
    // line are fixed); the canvas's own vertical mask fades their ends top and
    // bottom. The summed sine octaves give the irregular, chiselled edge.
    function drawSeparators() {
      ctx!.lineWidth = 1.2;
      ctx!.strokeStyle = isDark
        ? "rgba(212,165,95,0.22)"
        : "rgba(150,100,15,0.26)";
      const n = columns.length;
      for (let i = 0; i <= n; i++) {
        const baseX = i * COLUMN_STEP;
        const p = sepPhases[i] ?? 0;
        ctx!.beginPath();
        for (let y = -10; y <= height + 10; y += 4) {
          const dx =
            SEP_OCTAVES[0].a * Math.sin(y / SEP_OCTAVES[0].w + p) +
            SEP_OCTAVES[1].a * Math.sin(y / SEP_OCTAVES[1].w + p * 1.7 + 1.3) +
            SEP_OCTAVES[2].a * Math.sin(y / SEP_OCTAVES[2].w + p * 2.3 + 2.6);
          const x = baseX + dx;
          if (y <= -10) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        }
        ctx!.stroke();
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);
      ctx!.shadowBlur = 0;
      drawSeparators();
      ctx!.textAlign = "center";
      ctx!.textBaseline = "top";
      let curFont = "";
      for (const col of columns) {
        if (!col.active) continue;
        for (let j = 0; j < col.len; j++) {
          const y = col.y - j * LINE_STEP;
          if (y < -GLYPH_SIZE || y > height) continue;
          const frac = j / col.len;
          let b: number;
          if (j === 0) b = 1;
          else if (j === 1) b = 0.85;
          else if (j < 4) b = 0.7 - (j - 2) * 0.08;
          else b = Math.max(0, 0.55 * (1 - frac));
          b *= col.opacity;
          if (b < 0.03) continue;
          const cell = col.cells[j % col.cells.length];
          // The head-to-tail tone, flipped per ground. Dark: lead a warm
          // white-hot, then bright gold, then desert gold (≈ --gold) fading out
          // into the near-black. Light: the ramp inverts — a deep bronze-gold
          // lead (the darkest, most present on the page), then gold, then a
          // lighter gold that the alpha ramp dissolves up into the off-white.
          // The light ramp is pulled deeper than the gold tokens so the glyphs
          // read dark (not washed) on the off-white, rather than bright gold.
          const tone = isDark
            ? j === 0
              ? "255,247,230"
              : j < 3
                ? "240,206,140"
                : "214,167,96"
            : j === 0
              ? "134,79,0"
              : j < 3
                ? "167,108,0"
                : "207,145,5";
          const cx = col.x + COLUMN_STEP * 0.5;
          if (j === 0) {
            // Dark: a gold bloom behind the hot lead. Light: a glow would only
            // wash to white, so the lead gets a faint warm-dark halo instead —
            // a touch of carved weight rather than a glow.
            ctx!.shadowColor = isDark
              ? "rgba(245,215,150,0.5)"
              : "rgba(120,75,0,0.3)";
            ctx!.shadowBlur = isDark ? 6 : 4;
          }
          // Crossfade: dissolve the previous glyph out while the new one fades in
          // (a soft morph rather than a hard swap). Hieroglyphs use Noto, letters
          // the serif; the canvas font is only re-set when it changes.
          if (cell.prev !== null && cell.t < 1) {
            const aPrev = b * (1 - cell.t);
            if (aPrev > 0.02) {
              const fp =
                cell.prev.codePointAt(0)! >= 0x13000 ? hieroFont : serifFont;
              if (fp !== curFont) {
                ctx!.font = fp;
                curFont = fp;
              }
              ctx!.fillStyle = `rgba(${tone},${aPrev})`;
              ctx!.fillText(cell.prev, cx, y);
            }
          }
          const aCur = cell.t < 1 ? b * cell.t : b;
          if (aCur > 0.02) {
            const fc = cell.ch.codePointAt(0)! >= 0x13000 ? hieroFont : serifFont;
            if (fc !== curFont) {
              ctx!.font = fc;
              curFont = fc;
            }
            ctx!.fillStyle = `rgba(${tone},${aCur})`;
            ctx!.fillText(cell.ch, cx, y);
          }
          if (j === 0) {
            ctx!.shadowColor = "transparent";
            ctx!.shadowBlur = 0;
          }
        }
      }
    }

    function frame(ts: number) {
      if (cancelled) return;
      if (!last) last = ts;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }

    function manage() {
      const shouldRun = visible && !document.hidden;
      if (shouldRun && !raf) {
        last = 0;
        raf = requestAnimationFrame(frame);
      } else if (!shouldRun && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    const onVisibility = () => manage();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) draw();
    });
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        manage();
      },
      { threshold: 0 },
    );

    // Resolve the two font families synchronously from the CSS vars next/font
    // sets on <html>; the actual font files swap in on later frames as they load.
    const rootStyle = getComputedStyle(document.documentElement);
    const hieroRaw = rootStyle.getPropertyValue("--font-hieroglyph").trim();
    const serifRaw = rootStyle.getPropertyValue("--font-literata").trim();
    if (hieroRaw) hieroFont = `${GLYPH_SIZE}px ${hieroRaw}`;
    if (serifRaw) serifFont = `200 ${LETTER_SIZE}px ${serifRaw}`;

    // Start immediately — sizing the canvas and the loop must not wait on the
    // font download, or a slow (or already-settled) promise leaves it blank.
    resize();
    ro.observe(canvas);
    if (reduce) {
      draw(); // a single still field; no loop
    } else {
      io.observe(canvas);
      document.addEventListener("visibilitychange", onVisibility);
      manage();
    }

    // Warm the glyph fonts (and their subsets); the running loop picks them up
    // on the next frame, and we redraw once for the static reduced-motion case.
    const hieroPrimary = hieroRaw.split(",")[0].trim();
    const serifPrimary = serifRaw.split(",")[0].trim();
    Promise.allSettled(
      [
        hieroPrimary &&
          document.fonts.load(
            `${GLYPH_SIZE}px ${hieroPrimary}`,
            HIEROGLYPHS.slice(0, 6).join(""),
          ),
        serifPrimary &&
          document.fonts.load(`200 ${LETTER_SIZE}px ${serifPrimary}`, "ABCabc"),
      ].filter(Boolean),
    ).then(() => {
      if (!cancelled && reduce) draw();
    });

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isDark]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
