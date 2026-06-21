import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Binance Futures BB %B Screener",
  description:
    "Scan Binance USDⓈ-M perpetual futures for Bollinger Bands %B crossover signals. Runs server-side — no CORS extension or VPN setup required in the browser.",
  keywords: [
    "Binance",
    "Futures",
    "Bollinger Bands",
    "%B",
    "Screener",
    "Crypto",
    "Trading",
  ],
  authors: [{ name: "BB Screener" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Binance Futures BB %B Screener",
    description:
      "Scan Binance perpetual futures for Bollinger Bands %B crossover signals.",
    siteName: "BB Screener",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Binance Futures BB %B Screener",
    description:
      "Scan Binance perpetual futures for Bollinger Bands %B crossover signals.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
