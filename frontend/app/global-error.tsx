"use client";

import "./globals.css";

import { ErrorScreen } from "@/components/error-screen";

// Replaces the root layout when that layout itself crashes, so it brings its
// own html and body, and the same theme pick as the layout.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();",
          }}
        />
        <ErrorScreen error={error} />
      </body>
    </html>
  );
}
