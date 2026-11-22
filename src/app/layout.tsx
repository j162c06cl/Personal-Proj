import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Dip",
  description: "Personal stock and ETF research assistant",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#ffffff" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-white text-[#0A0A0A] min-h-screen`}>
        <NavBar />
        <main className="w-full px-4 sm:px-6 lg:px-8 pt-4 lg:pt-6 pb-28 lg:pb-10">{children}</main>
      </body>
    </html>
  );
}
