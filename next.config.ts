import type { NextConfig } from "next";

// Set NEXT_PUBLIC_BASE_PATH=/repo-name when building for a GitHub Pages
// *project* page (https://user.github.io/repo-name/). Leave unset for local
// dev or a *.github.io user/org page served from the domain root.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // Fully static site: no server, no API routes, no image optimization
  // service — everything ships as plain files servable by GitHub Pages.
  output: "export",
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
