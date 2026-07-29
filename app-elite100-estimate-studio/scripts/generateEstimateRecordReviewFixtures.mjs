/**
 * DEPRECATED — static HTML screenshots are rejected.
 * Use the real component harness instead:
 *
 *   node app-elite100-estimate-studio/scripts/runEstimateRecordVisualProof.mjs
 *
 * That mounts production React components via vite.review.config.ts and
 * captures PNGs under .local/review/estimate-record-commercial-controls-v2/.
 */
console.error(
  "Static HTML fixture screenshots are retired. Run:\n  node app-elite100-estimate-studio/scripts/runEstimateRecordVisualProof.mjs"
);
process.exit(1);
