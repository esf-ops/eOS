/**
 * Local stand-in for the Windows sales order agent: same HTTP protocol, but QuickBooks is
 * the in-memory simulator. For local/non-production end-to-end runs only; refuses any
 * Brain URL that is not loopback.
 *
 *   QB_SO_AGENT_BRAIN_URL=http://127.0.0.1:8787 QB_SO_AGENT_TOKEN=... \
 *   QB_SO_SIM_COMPANY="Elite Stone TEST (simulated)" node backend-core/src/scripts/qbSalesOrderSimulatorAgent.mjs [--loop]
 */
import { createQuickBooksSimulator } from "../elite100EstimateStudio/qbSalesOrder/qbSalesOrderSimulator.mjs";

const brain = String(process.env.QB_SO_AGENT_BRAIN_URL || "").replace(/\/+$/, "");
const token = String(process.env.QB_SO_AGENT_TOKEN || "");
if (!brain || !token) {
  console.error("QB_SO_AGENT_BRAIN_URL and QB_SO_AGENT_TOKEN are required.");
  process.exit(2);
}
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(brain).hostname)) {
  console.error("Refusing: the simulator agent only talks to a loopback Brain.");
  process.exit(2);
}

const qb = createQuickBooksSimulator({
  companyName: process.env.QB_SO_SIM_COMPANY || "Elite Stone TEST (simulated)",
  startSeq: Number(process.env.QB_SO_SIM_START_SEQ) || Math.floor(Date.now() / 1000)
});

async function call(path, body) {
  const res = await fetch(`${brain}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status} ${json?.code || json?.error || ""}`);
  return json;
}

async function runOnce() {
  let processed = 0;
  for (;;) {
    let { work } = await call("/api/internal/qb-sales-order-agent/next", { agentVersion: "simulator" });
    if (!work) break;
    processed += 1;
    while (work) {
      let responseXml = null;
      let transportError = null;
      try {
        responseXml = qb.handle(work.qbXml);
      } catch (e) {
        transportError = e.message;
      }
      const r = await call("/api/internal/qb-sales-order-agent/result", {
        jobId: work.jobId,
        attemptId: work.attemptId,
        step: work.step,
        responseXml,
        transportError
      });
      console.log(`job ${work.jobId} ${work.step} -> ${r.job?.statusLabel || "?"} ${r.job?.qbRefNumber || ""}${r.stale ? " (stale)" : ""}`);
      work = r.work;
    }
  }
  return processed;
}

if (process.argv.includes("--loop")) {
  for (;;) {
    try {
      await runOnce();
    } catch (e) {
      console.error("run failed:", e.message);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
} else {
  console.log(`processed ${await runOnce()} job(s); simulated sales orders: ${qb.state.salesOrders.map((s) => `${s.refNumber}=$${(s.subtotalCents / 100).toFixed(2)}`).join(", ") || "none"}`);
}
