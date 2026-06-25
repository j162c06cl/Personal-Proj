import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Investor Research",
  description: "Personal stock and ETF research assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#f5f5f7] text-[#1d1d1f] min-h-screen`}>
        <NavBar />
        <main className="w-full px-4 sm:px-6 lg:px-8 py-6">{children}</main>
      </body>
    </html>
  );
}
