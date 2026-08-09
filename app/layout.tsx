import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

const satoshi = localFont({
  variable: "--font-satoshi",
  display: "swap",
  src: [
    {
      path: "../fonts/Satoshi-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/Satoshi-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/Satoshi-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://funda.ng"),
  applicationName: "Funda",
  title: {
    default: "Funda · Life, funded",
    template: "%s · Funda",
  },
  description: "Affordable data, airtime and electricity payments in one simple place.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Funda",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: "Funda",
    title: "Funda · Life, funded",
    description: "More data. Less money. Airtime and electricity payments made simple.",
    url: "https://funda.ng",
  },
  twitter: {
    card: "summary",
    title: "Funda · Life, funded",
    description: "More data. Less money. Airtime and electricity payments made simple.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#111313",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${satoshi.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
