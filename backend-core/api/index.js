/**
 * Vercel serverless entry — `vercel.json` rewrites `/api/*` here.
 * Local development: `npm run eos:server` from repo root (runs `src/server.js` directly).
 */
import { app } from "../src/server.js";

export default app;
