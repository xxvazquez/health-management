import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/lib/DataContext";
import { VisibleDomainsProvider } from "@/lib/visibleDomains";
import { AuthProvider } from "@/lib/supabase/AuthContext";
import { Nav } from "@/components/Nav";
import { BottomNav } from "@/components/BottomNav";
import { ContentContainer } from "@/components/ContentContainer";
import { AuthBanner } from "@/components/auth/AuthBanner";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { AppLoadingSplash } from "@/components/AppLoadingSplash";
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer";
import { ThemeManager } from "@/components/ThemeManager";
import { MobileMenuProvider } from "@/components/MobileMenuProvider";

// Runs before first paint: resolves the stored appearance choice (light/
// dark/system, plus each mode's own ground palette) and stamps `data-theme`
// + `data-palette` on <html> so there's no flash of the wrong look. Kept in
// step with `applyThemePref` in src/lib/theme.ts.
const THEME_INIT = `try{var v=localStorage.getItem("lauva-theme");var d=v==="dark"||(v!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";var lp=localStorage.getItem("lauva-palette-light");var dp=localStorage.getItem("lauva-palette-dark");var p=d?(dp==="d2"||dp==="d4"?dp:"d1"):(lp==="l1"||lp==="l4"||lp==="l5"?lp:"l3");if(p==="l3"||p==="d1"){delete document.documentElement.dataset.palette;}else{document.documentElement.dataset.palette=p;}var bg={l1:"#f6faf9",l3:"#f4f6f8",l4:"#f7f5fb",l5:"#ffffff",d1:"#12161b",d2:"#181613",d4:"#15161c"}[p];var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute("content",bg);}catch(e){}`;

// Inter is the fallback for non-Apple platforms (Apple devices render the
// system face, SF Pro — see --font-app in globals.css). Not preloaded, so
// Apple visitors never fetch it.
const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  preload: false,
});

export const metadata: Metadata = {
  title: "Lauva",
  description:
    "A personal food, supplement, and habit analytics dashboard — entirely client-side.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Lauva",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // A single tag the pre-paint script and ThemeManager keep in step with the
  // resolved theme (an in-app Dark choice under an OS Light setting still
  // needs the browser chrome dark, which a media-query tag can't do).
  themeColor: "#f4f6f8",
  // Pinch-zoom and double-tap-zoom disabled outright so the installed PWA
  // holds still like a native app rather than panning/zooming as a web
  // page — safe because every text-like input is already bumped to 16px
  // on mobile (see globals.css), so nothing relies on manual zoom to read
  // or fill in a field.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Installed on the iOS home screen the app runs edge to edge, so the
  // bottom tab bar, top bar and drawer pad themselves off the notch and
  // home indicator with env(safe-area-inset-*). Without cover those insets
  // are always 0 and the tab bar labels sit under the home indicator.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${bodyFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col lg:flex-row">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <RegisterServiceWorker />
        <ThemeManager />
        <AuthProvider>
          <AppLoadingSplash />
          <DataProvider>
            <VisibleDomainsProvider>
              <MobileMenuProvider>
                <Nav />
                {/* No mobile top bar (its trigger lives in each screen's
                    title row) — so `<main>` itself clears the notch. */}
                <main className="flex min-w-0 flex-1 flex-col pt-[env(safe-area-inset-top)] lg:pt-0">
                  <AuthBanner />
                  <SyncStatusBanner />
                  {/* pb-24 on mobile clears the fixed BottomNav so the last
                      list row is never tucked under it; desktop has no
                      fixed nav and drops back to pb-10. */}
                  <div className="px-4 pt-5 pb-24 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 lg:pb-10">
                    <ContentContainer>{children}</ContentContainer>
                    <MedicalDisclaimer />
                  </div>
                  <BottomNav />
                </main>
              </MobileMenuProvider>
            </VisibleDomainsProvider>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
