import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";
import { AppProviders } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Seven",
  description: "Privacy-first multi-model council orchestration.",
};

export default function RootLayout(props: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>
          <AppShell>{props.children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
