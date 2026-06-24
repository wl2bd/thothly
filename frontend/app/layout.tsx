import type { Metadata } from "next";
import {
  Geist_Mono,
  Literata,
  Noto_Sans_Egyptian_Hieroglyphs,
} from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
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

// Display geometric — CMGeom (`--font-display`): the brand's voice, reserved for
// the biggest moment (the hero). Regular only; never used for body, UI or data.
// See DESIGN.md, The Display Restraint Rule.
const cmGeom = localFont({
  src: "./fonts/CMGeom-Regular.otf",
  weight: "400",
  style: "normal",
  variable: "--font-cmgeom",
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
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
// e-reader reading. Reserved for the "book" surfaces — the EPUB tablet in the
// landing illustration and the Latin letters of the hero glyph rain — so the
// edition has a literary voice while the tool stays grotesk. NOT for UI/body.
const literata = Literata({
  weight: ["200", "300", "400", "600"],
  subsets: ["latin"],
  variable: "--font-literata",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Thothly · Read anything like a book",
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
      className={`${hostGrotesk.variable} ${cmGeom.variable} ${geistMono.variable} ${notoHieroglyphs.variable} ${literata.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Set the theme class before paint so there's no light/dark flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();",
          }}
        />
        {/* Shared SVG filter for the stone tablet edge (components using
            .stone-frame). Defined once here so filter: url(#…) always resolves. */}
        <StoneFilterDefs />
        {children}
      </body>
    </html>
  );
}
