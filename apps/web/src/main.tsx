import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import "./index.css";
import "./i18n";
import { App } from "./App";
import { AuthProvider } from "./context/auth-context";
import { AdminAuthProvider } from "./context/admin-auth-context";
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx (not found, forbidden, invalid) won't change on retry — only retry network/server failures.
      retry: (failureCount, error) => {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        return failureCount < 1 && !(status && status >= 400 && status < 500);
      },
      staleTime: 30_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <AdminAuthProvider>
            <App />
            <PwaUpdatePrompt />
          </AdminAuthProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
