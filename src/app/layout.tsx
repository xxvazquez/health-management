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
  title: "Lauva",
  description: "A personal food, supplement, and habit analytics dashboard — entirely client-side.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodyFont.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col lg:flex-row">
        <AuthProvider>
          <DataProvider>
            <Nav />
            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
              <div className="mx-auto w-full max-w-5xl">{children}</div>
            </main>
          </DataProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
