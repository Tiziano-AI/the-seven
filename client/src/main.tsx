import { trpc } from "@/lib/trpc";
import { httpBatchLink } from "@trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { useRef, useState, type ReactNode } from "react";
import superjson from "superjson";
import App from "./App";
import { ApiKeyProvider, useApiKey } from "./contexts/ApiKeyContext";
import "./global.css";

function TrpcProvider({ children }: { children: ReactNode }) {
  const { apiKey } = useApiKey();

  const apiKeyRef = useRef<string | null>(apiKey);
  apiKeyRef.current = apiKey;

  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: "/api/trpc",
          transformer: superjson,
          headers() {
            const key = apiKeyRef.current;
            return key ? { Authorization: `Bearer ${key}` } : {};
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <ApiKeyProvider>
    <TrpcProvider>
      <App />
    </TrpcProvider>
  </ApiKeyProvider>
);
