import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Dip",
  description: "Personal stock and ETF research assistant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#F7F7F8] text-[#0A0A0A] min-h-screen`}>
        <NavBar />
        <main className="w-full px-4 sm:px-6 lg:px-8 py-6">{children}</main>
      </body>
    </html>
  );
}
