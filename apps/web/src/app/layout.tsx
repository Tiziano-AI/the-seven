import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/app/app-shell";
import { AppProviders } from "./providers";
import "./globals.css";

const scholarlyChromeColor = "#101916";

const medievalSharp = localFont({
  src: "./fonts/medieval-sharp.ttf",
  weight: "400",
  variable: "--font-medieval",
  display: "swap",
});

const sourceSerif = localFont({
  src: [
    {
      path: "./fonts/source-serif-4.ttf",
      style: "normal",
      weight: "200 900",
    },
    {
      path: "./fonts/source-serif-4-italic.ttf",
      style: "italic",
      weight: "200 900",
    },
  ],
  variable: "--font-serif",
  display: "swap",
});

const victorMono = localFont({
  src: "./fonts/victor-mono.ttf",
  weight: "100 700",
  variable: "--font-victor",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Seven",
  description: "Privacy-first multi-model council orchestration.",
  applicationName: "The Seven",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: scholarlyChromeColor,
};

export default function RootLayout(props: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${medievalSharp.variable} ${sourceSerif.variable} ${victorMono.variable}`}
    >
      <body>
        <AppProviders>
          <AppShell>{props.children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
