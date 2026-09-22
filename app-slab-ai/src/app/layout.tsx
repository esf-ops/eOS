import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { AuthGate } from "@/components/auth/AuthGate";
import "../../../shared/eliteos-ui/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "slabOS AI Studio",
  description:
    "Specialized AI coworkers for stone and countertop fabrication — sales, shop, and customer care.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <AuthProvider>
          <AppShell>
            <AuthGate>{children}</AuthGate>
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
