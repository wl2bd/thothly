import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The link preview card (Slack, X, LinkedIn…). Deliberately plain: the night
// ground, the headline, one gold rule. ImageResponse can't read CSS custom
// properties, so the colors below are the dark-theme tokens from globals.css
// (--background, --foreground, --muted-foreground, --primary) converted to sRGB.
// Change them there first, then here.
const INK = "#f5f5f5";
const GROUND = "#070707";
const MUTED = "#9e9e9e";
const GOLD = "#cf952a";

export const alt = "Thothly. Make anything readable.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  // Prociono sets every line: Satori can't parse variable fonts, and Host
  // Grotesk only ships as one.
  const prociono = await readFile(
    join(process.cwd(), "app/fonts/Prociono.otf"),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: GROUND,
          color: INK,
          fontFamily: "Prociono",
        }}
      >
        <div style={{ fontSize: 32, color: MUTED }}>Thothly</div>
        <div
          style={{ width: 72, height: 3, background: GOLD, margin: "36px 0" }}
        />
        <div style={{ fontSize: 96, lineHeight: 1.05, letterSpacing: -2 }}>
          Make anything readable
        </div>
        <div
          style={{
            fontSize: 34,
            lineHeight: 1.4,
            color: MUTED,
            marginTop: 32,
            maxWidth: 900,
          }}
        >
          Turn videos, podcasts, articles, even whole playlists into one clean
          read for your e-reader or your AI.
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Prociono", data: prociono, style: "normal", weight: 400 }],
    },
  );
}
