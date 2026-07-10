import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Public kiosk presentation head. No backend proxy: this app is intentionally
// static and public-only (no login, no internal APIs). Client-side routing is
// handled by a lightweight custom router (see src/lib/kioskRoutes.ts), so the
// host (Vercel) must rewrite all paths to index.html — see vercel.json.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5195,
    host: true,
  },
  preview: {
    port: 5195,
    host: true,
  },
});
