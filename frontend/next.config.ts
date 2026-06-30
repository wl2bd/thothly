import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables React's <ViewTransition> integration so route navigations animate
    // (used to morph the home search card into the job card). Aliases react to
    // Next's bundled react-experimental, where <ViewTransition> lives.
    viewTransition: true,
  },
};

export default nextConfig;
