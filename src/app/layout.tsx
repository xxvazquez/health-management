import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/lib/DataContext";
import { AuthProvider } from "@/lib/supabase/AuthContext";
import { Nav } from "@/components/Nav";
import { AuthBanner } from "@/components/auth/AuthBanner";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

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
            <Nav />
            <main className="flex min-w-0 flex-1 flex-col">
              <AuthBanner />
              <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
                <div className="mx-auto w-full max-w-4xl">{children}</div>
              </div>
              <footer className="px-4 pb-6 sm:px-6 lg:px-8">
                <p
                  className="mx-auto w-full max-w-4xl text-center text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  Lauva provides personal data insights only. It is not medical
                  advice and does not diagnose or treat medical conditions.
                </p>
              </footer>
            </main>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
