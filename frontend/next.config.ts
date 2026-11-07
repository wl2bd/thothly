import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a dev server shared over Tailscale (`tailscale serve`) hydrate on
  // another machine of the tailnet; Next blocks cross-origin dev assets otherwise.
  allowedDevOrigins: ["**.ts.net"],
  // AI models moved from a page into a side panel on every screen.
  async redirects() {
    return [{ source: "/settings", destination: "/", permanent: false }];
  },
};

export default nextConfig;
