/**
 * Drives the staff side of Quote Flow against a LOCAL Brain (loopback only) with the
 * synthetic staff user: price (custom slab package), calculate, review, publish.
 * Uses the same HTTP routes as the Quote Flow head.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=... NONPROD_STAFF_PASSWORD=... \
 *   BRAIN_URL=http://127.0.0.1:3001 node backend-core/src/scripts/nonprod/quoteFlowStaffDriver.mjs <estimateId> [price|publish|status|clone|studio-mark-sold|pricing-basis-review]
 */
const supabaseUrl = String(process.env.SUPABASE_URL || "");
const anon = String(process.env.SUPABASE_ANON_KEY || "");
const brain = String(process.env.BRAIN_URL || "http://127.0.0.1:3001").replace(/\/+$/, "");
const password = String(process.env.NONPROD_STAFF_PASSWORD || "");
const [estimateId, stage = "status"] = process.argv.slice(2);
for (const u of [supabaseUrl, brain]) {
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(u).hostname)) {
    console.error(`REFUSED: ${u} is not loopback.`);
    process.exit(2);
  }
}
if (!estimateId) {
  console.error("usage: quoteFlowStaffDriver.mjs <estimateId> [price|publish|status|clone|studio-mark-sold|pricing-basis-review]");
  process.exit(2);
}

const auth = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "content-type": "application/json" },
  body: JSON.stringify({ email: "staff@nonprod.eliteos.local", password })
}).then((r) => r.json());
const token = auth.access_token;
if (!token) throw new Error("login failed");

async function api(method, path, body) {
  const res = await fetch(`${brain}/api/elite100-quote-flow/estimates/${estimateId}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${json.code || ""} ${json.error || ""} ${JSON.stringify(json.diagnostic || "")}`);
  return json;
}

async function fetchJson(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url.replace(brain, "")} ${res.status} ${json.code || ""} ${json.error || ""}`);
  return json;
}

const studio = (method, path, body, headers) =>
  fetchJson(method, `${brain}/api/elite100-estimate-studio${path}`, body, headers);

const money = (v) => (v == null ? "—" : `$${Number(v).toFixed(2)}`);

if (stage === "price") {
  const pricing = await api("GET", "/pricing");
  const rooms = pricing.startingSelections?.rooms || [];
  const edge = process.env.DRIVER_EDGE || "edge_eased";
  const draft = {
    pricingBasis: "wholesale",
    materialGroup: "Group B",
    colorName: "",
    colorTbd: true,
    edgeProfileToken: edge,
    addOns: { tearout: 0 },
    roomSelections: rooms.map((r) => ({
      roomId: r.roomId,
      slabPackageId: process.env.DRIVER_NO_PACKAGE === "1" ? null : "pkg-1",
      colorNameOverride: "",
      colorTbd: false,
      edgeProfileToken: edge,
      includeBacksplash: false
    })),
    customLineItems: [],
    slabPackages: [
      {
        id: "pkg-1",
        colorName: "Synthetic Exotic Quartzite",
        supplier: "Synthetic Supply",
        thickness: "3cm",
        slabLengthIn: 120,
        slabWidthIn: 60,
        costPerSlab: 1234.57,
        wastePercent: 20,
        confirmedSlabQuantity: 2
      }
    ]
  };
  await api("PATCH", "/pricing", draft);
  const calc = await api("POST", "/pricing/calculate", {});
  const last = calc.lastCalculation || calc;
  console.log(
    JSON.stringify(
      {
        edge,
        customerDisplayTotal: last.customerDisplayTotal,
        exactInternalTotal: last.exactInternalTotal,
        openEdgeAmount: last.openEdgeAmount,
        linePreview: last.linePreview,
        packages: (calc.slabPackages?.packages || []).map((p) => ({ id: p.id, calculated: p.calculated, issues: p.issues })),
        warnings: last.warnings,
        unresolved: last.unresolvedItems,
        blockers: calc.blockers
      },
      null,
      2
    )
  );
} else if (stage === "publish") {
  const review = await api("GET", "/review");
  if (!review.approved && review.status !== "approved") await api("POST", "/review/approve", { confirm: true });
  const pub = await api("POST", "/digital-estimate/publish", { confirm: true });
  const de = await api("GET", "/digital-estimate");
  console.log(JSON.stringify({ customerUrl: pub.customerUrl || de.customerUrl || de.activePublication?.customerUrl || null, publicationId: pub.publicationId || de.activePublication?.id || null, total: money(de.customerDisplayTotal ?? pub.customerDisplayTotal) }, null, 2));
} else if (stage === "clone") {
  // <estimateId> is the source: create a Studio manual estimate and copy its official scope.
  const src = await api("GET", "");
  const created = await studio("POST", "/manual-estimates", {
    customerName: src.estimate.customerName || "Synthetic Builders Inc",
    projectName: `${src.estimate.projectName || "Synthetic project"} (copy)`
  }, { "idempotency-key": `driver-clone-${Date.now()}` });
  const id = created.estimateId;
  const { scope } = src.estimate;
  await fetchJson("PATCH", `${brain}/api/elite100-quote-flow/estimates/${id}/scope`, {
    scope: { rooms: scope.rooms, addOns: scope.addOns, projectName: `${scope.projectName || "Synthetic"} (copy)` }
  });
  console.log(JSON.stringify({ estimateId: id }, null, 2));
} else if (stage === "add-vanity-room") {
  // Takeoff-shaped bathroom: 37" vanity read at cabinet depth (21.5") with one sink opening.
  const src = await api("GET", "");
  const { scope } = src.estimate;
  const rooms = (scope.rooms || []).filter((r) => r.id !== "room-bath-1");
  rooms.push({
    id: "room-bath-1",
    name: "Primary Bath",
    roomType: "Vanity",
    included: true,
    pieces: [
      {
        id: "piece-vanity-1",
        name: "Vanity",
        pieceType: "counter",
        lengthIn: 37,
        depthIn: 21.5,
        quantity: 1,
        included: true,
        cutouts: [{ type: "vanity_bar_sink", quantity: 1, source: "estimator_confirmed" }]
      }
    ]
  });
  await api("PATCH", "/scope", { scope: { rooms, addOns: scope.addOns } });
  console.log(JSON.stringify({ estimateId, rooms: rooms.map((r) => r.name) }, null, 2));
} else if (stage === "studio-mark-sold") {
  // Studio's own routes, not Quote Flow's, to verify that path enqueues too.
  const ws = await studio("GET", `/estimates/${estimateId}/sold-review`);
  if (!ws.soldSnapshot) {
    const checklist = Object.fromEntries(Object.keys(ws.checklistLabels || {}).map((k) => [k, true]));
    await studio("PUT", `/estimates/${estimateId}/sold-review`, { checklist });
  }
  const sold = await studio("POST", `/estimates/${estimateId}/mark-sold`, {});
  console.log(JSON.stringify({ soldSnapshotId: sold.soldSnapshot?.id, reused: sold.reused ?? null, salesOrder: sold.salesOrder, salesOrderError: sold.salesOrderError }, null, 2));
} else if (stage === "pricing-basis-review") {
  // <estimateId> is ignored; the review is org-wide for the signed-in staff user.
  const r = await fetchJson("GET", `${brain}/api/elite100-quote-flow/digital-estimate/pricing-basis-review`);
  console.log(JSON.stringify(r.review, null, 2));
} else {
  const [sold, so] = await Promise.all([api("GET", "/sold"), api("GET", "/sales-order")]);
  console.log(JSON.stringify({ lifecycle: sold.estimate?.lifecycleStatus, acceptance: sold.acceptance, soldReview: sold.soldReview?.checklistComplete, soldSnapshot: sold.soldSnapshot, salesOrder: so.salesOrder }, null, 2));
}
