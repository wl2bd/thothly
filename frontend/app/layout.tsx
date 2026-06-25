import type { Metadata } from "next";
import {
  Geist_Mono,
  Literata,
  Noto_Sans_Egyptian_Hieroglyphs,
  Noto_Serif_Display,
} from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Grain } from "@/components/grain";
import { StoneFilterDefs } from "@/components/ui/stone-border";

// Body / UI grotesk — Host Grotesk (variable, OFL): the readable sans that runs
// the whole tool (`--font-sans`). Upright + italic variable files cover 300–800.
const hostGrotesk = localFont({
  src: [
    {
      path: "./fonts/HostGrotesk-VariableFont_wght.ttf",
      weight: "300 800",
      style: "normal",
    },
    {
      path: "./fonts/HostGrotesk-Italic-VariableFont_wght.ttf",
      weight: "300 800",
      style: "italic",
    },
  ],
  variable: "--font-host-grotesk",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

// Display — Prociono (`--font-display`): the brand's display voice, reserved for
// the biggest moments (the hero line + the landing section headings). Regular
// only; never used for body, UI or data. See DESIGN.md, The Display Restraint
// Rule. (Replaced the geometric CMGeom 2026-06-24, Wael's call.)
const prociono = localFont({
  src: "./fonts/Prociono.otf",
  weight: "400",
  style: "normal",
  variable: "--font-prociono",
  display: "swap",
  fallback: ["Georgia", "serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Glyph rain font — Noto Sans Egyptian Hieroglyphs (`--font-hieroglyph`), used
// by the hero canvas in both modes (components/hieroglyph-rain.tsx). Self-hosted
// at build like the rest; not preloaded, since it's a decorative background asset
// that must never block first paint. Latin subset included so the interspersed
// letters render in the same family as the hieroglyphs.
const notoHieroglyphs = Noto_Sans_Egyptian_Hieroglyphs({
  weight: "400",
  subsets: ["egyptian-hieroglyphs", "latin"],
  variable: "--font-hieroglyph",
  display: "swap",
  preload: false,
});

// Edition serif — Literata (`--font-edition`): the serif Google designed for
// e-reader reading. Reserved for the EPUB tablet in the landing illustration —
// the meaningful "book" surface — so the edition has a literary voice while the
// tool stays grotesk. NOT for UI/body. (The hero rain letters use a thinner
// serif, below.)
const literata = Literata({
  weight: ["400", "600"],
  subsets: ["latin"],
  variable: "--font-literata",
  display: "swap",
});

// Rain serif — Noto Serif Display Thin (`--font-rain-serif`): a true hairline
// (weight 100, finer than Literata's lightest 200) for the Latin letters in the
// hero glyph rain only. Pairs with the Noto hieroglyphs (same superfamily) and
// keeps the falling letters as fine as the single-weight glyphs. Decorative,
// dark+light background asset → not preloaded.
const notoSerifThin = Noto_Serif_Display({
  weight: "100",
  subsets: ["latin"],
  variable: "--font-rain-serif",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Thothly · Make anything readable",
  description: "Compile whatever you want to read, no matter where it comes from.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      // Light mode is temporarily disabled — the app is locked to dark via this
      // hardcoded `dark` class (works without JS and matches the SSR markup, so
      // no flash). To re-enable light: drop `dark` here, restore the no-flash
      // theme script in <body> below, and re-mount <ThemeToggle /> in app/page.tsx.
      className={`dark ${hostGrotesk.variable} ${prociono.variable} ${geistMono.variable} ${notoHieroglyphs.variable} ${literata.variable} ${notoSerifThin.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Theme is locked to dark (see <html> className). The no-flash script
            that read localStorage / prefers-color-scheme is parked here for when
            light mode comes back:
            <script dangerouslySetInnerHTML={{ __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();" }} /> */}
        {/* Shared SVG filter for the stone tablet edge (components using
            .stone-frame). Defined once here so filter: url(#…) always resolves. */}
        <StoneFilterDefs />
        {/* App-wide grain — Thothly's signature material promoted to a system
            ground. One fixed layer behind all content (-z-10), so it textures
            the page background and lets transparent sections reveal it while
            opaque cards stay clean. Deliberately NO mix-blend: a mean-preserving
            blend (overlay/soft-light) vanishes on the near-black ground, so the
            grain is an additive translucent noise layer instead — its amplitude
            is the same whatever the backdrop, which is what makes it read
            identically on the night ground and the light page from a single
            opacity (no `dark:` variant). The small uniform lift this puts on the
            black is the intended film-grain texture, kept to a few levels. */}
        <Grain className="pointer-events-none fixed inset-0 -z-10 size-full opacity-[0.05]" />
        {children}
      </body>
    </html>
  );
}
