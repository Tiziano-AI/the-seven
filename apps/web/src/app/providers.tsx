"use client";

import { Toaster } from "sonner";
import { AuthProvider } from "@/components/app/auth-provider";

export function AppProviders(props: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthProvider>
      {props.children}
      <Toaster
        position="bottom-right"
        theme="dark"
        duration={4000}
        offset={{ right: "1rem", bottom: "1rem" }}
        mobileOffset={{ bottom: "1rem", left: "1rem", right: "1rem" }}
      />
    </AuthProvider>
  );
}
