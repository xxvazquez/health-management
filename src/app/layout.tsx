import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/lib/DataContext";
import { AuthProvider } from "@/lib/supabase/AuthContext";
import { Nav } from "@/components/Nav";

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Health Analytics",
  description: "A personal food, supplement, and habit analytics dashboard — entirely client-side.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodyFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <DataProvider>
            <Nav />
            <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-8">{children}</main>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
