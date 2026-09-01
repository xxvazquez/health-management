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
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer";

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
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
  themeColor: "#e6f1f2",
  // Explicit (matches Next's own default) rather than disabling zoom
  // outright — the actual "stuck zoomed in" bug was iOS auto-zooming on
  // focus of small-font form fields (fixed in globals.css), not the user
  // pinch-zooming; disabling user-scalable would take away real zoom
  // instead of fixing that.
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
    <html lang="en" className={`${bodyFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col lg:flex-row">
        <RegisterServiceWorker />
        <AuthProvider>
          <DataProvider>
            <VisibleDomainsProvider>
              <Nav />
              <main className="flex min-w-0 flex-1 flex-col">
                <AuthBanner />
                <SyncStatusBanner />
                {/* pb-36 on mobile clears the fixed BottomNav plus the
                    floating "+" action that sits above it (PrimaryAction),
                    so the last list row is never tucked under either;
                    desktop has neither and drops back to pb-10. */}
                <div className="px-4 pt-5 pb-36 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8 lg:pb-10">
                  <ContentContainer>{children}</ContentContainer>
                  <MedicalDisclaimer />
                </div>
                <BottomNav />
              </main>
            </VisibleDomainsProvider>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
