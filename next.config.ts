import type { NextConfig } from "next";

// Leave NEXT_PUBLIC_BASE_PATH unset for local dev and for the current
// deploy target (lauva.pl, a custom domain — see public/CNAME — always
// served from the root). Only set it to /repo-name if this ever moves back
// to a plain GitHub Pages *project* page (https://user.github.io/repo-name/).
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
