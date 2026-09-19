import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

// Baked in at build time for the Settings footer. Every commit is a new
// version: package.json supplies major.minor and the commit count is the patch
// number. All three fall back to empty / package.json's own version when git
// isn't available (e.g. a source tarball build).
function git(command: string): string {
  try {
    return execSync(`git ${command}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}
const packageVersion = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;
const commitCount = git("rev-list --count HEAD");
const appVersion = commitCount ? `${packageVersion.split(".").slice(0, 2).join(".")}.${commitCount}` : packageVersion;

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
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_COMMIT_HASH: git("log -1 --format=%h"),
    NEXT_PUBLIC_COMMIT_DATE: git("log -1 --format=%cI"),
  },
};

export default nextConfig;
