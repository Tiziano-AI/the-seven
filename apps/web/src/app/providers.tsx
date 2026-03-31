"use client";

import { Toaster } from "sonner";
import { AuthProvider } from "@/components/app/auth-provider";

export function AppProviders(props: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthProvider>
      {props.children}
      <Toaster richColors position="top-right" theme="dark" />
    </AuthProvider>
  );
}
