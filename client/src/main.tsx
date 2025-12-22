import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { useState, type ReactNode } from "react";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import "./global.css";

function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

createRoot(document.getElementById("root")!).render(
  <AuthProvider>
    <QueryProvider>
      <App />
    </QueryProvider>
  </AuthProvider>
);
