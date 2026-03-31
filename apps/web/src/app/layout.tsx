import type { Metadata } from "next";
import { MedievalSharp, Raleway, Victor_Mono } from "next/font/google";
import { AppShell } from "@/components/app/app-shell";
import { AppProviders } from "./providers";
import "./globals.css";

const medievalSharp = MedievalSharp({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-medieval",
  display: "swap",
});

const raleway = Raleway({
  subsets: ["latin"],
  variable: "--font-raleway",
  display: "swap",
});

const victorMono = Victor_Mono({
  subsets: ["latin"],
  variable: "--font-victor",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Seven",
  description: "Privacy-first multi-model council orchestration.",
};

export default function RootLayout(props: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`dark ${medievalSharp.variable} ${raleway.variable} ${victorMono.variable}`}
    >
      <body>
        <AppProviders>
          <AppShell>{props.children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
