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

// Runs before first paint: resolves the stored appearance choice (or the OS
// setting) and stamps `data-theme` on <html> so there's no flash of the
// wrong theme. Kept in step with `applyThemePref` in src/lib/theme.ts.
const THEME_INIT = `try{var v=localStorage.getItem("lauva-theme");var d=v==="dark"||(v!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";var m=document.querySelector('meta[name=theme-color]');if(m)m.setAttribute("content",d?"#151b1e":"#e6f1f2");}catch(e){}`;

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
  themeColor: "#e6f1f2",
  // Explicit (matches Next's own default) rather than disabling zoom
  // outright — pinch-zoom stays available. iOS may zoom in when a form
  // field under 16px takes focus; that's accepted so fields keep the
  // 14px/12px scale of the surrounding UI.
  width: "device-width",
  initialScale: 1,
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
