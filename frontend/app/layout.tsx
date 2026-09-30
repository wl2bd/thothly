import { BgDemo } from "@/components/bg-demo";
import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Grain } from "@/components/grain";
import { Toaster } from "@/components/ui/sonner";

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
// titles only (the hero, section headings, page and chapter titles). Regular
// only; never used for body, UI or data. See DESIGN.md, The Display Restraint
// Rule. (Replaced the geometric CMGeom 2026-06-24.)
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

const DESCRIPTION =
  "Turn videos, podcasts, articles, even whole playlists into one clean read for your e-reader or your AI.";

export const metadata: Metadata = {
  // Link previews need absolute URLs (the card image). Vercel sets the
  // production host; anywhere else (self-hosting, dev) previews are moot.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
  ),
  title: "Thothly - Make anything readable",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Thothly",
    title: "Thothly - Make anything readable",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
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
      className={`${hostGrotesk.variable} ${prociono.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* No-flash theme: set the `dark` class before first paint from the
            saved choice (localStorage) or the OS preference, so light and dark
            are both first-class with no flash. <html suppressHydrationWarning>
            above tolerates the SSR/client class difference this introduces. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();",
          }}
        />
        {/* Skip link: the first Tab stop, hidden until focused, jumps past the
            header to each page's <main id="main">. */}
        <a
          href="#main"
          className="bg-primary text-primary-foreground sr-only z-50 rounded-lg px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
        >
          Skip to content
        </a>
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
        <Grain className="pointer-events-none fixed inset-0 -z-10 size-full opacity-5" />
        {/* A still glow rising from the bottom of the page. It lives here, in the
            layout that persists across navigation, so it carries from page to
            page instead of redrawing. White panes (the compilation) simply sit
            over it. */}
        <div
          aria-hidden="true"
          className="glow-layer bg-(image:--glow) pointer-events-none fixed inset-x-0 top-14 bottom-0 -z-10 bg-no-repeat"
        />
        {children}
        <BgDemo />
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
