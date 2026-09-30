/**
 * Seed a LOCAL non-production Supabase with synthetic data for the Quote Flow →
 * Digital Estimate → Mark Sold → QuickBooks sales order workflow.
 *
 * Refuses any SUPABASE_URL that is not loopback. Idempotent. Everything it creates is
 * synthetic and labeled as such; QuickBooks ids are SIM-* and the company is the simulator.
 *
 *   DOTENV_CONFIG_PATH=~/eliteos-nonprod/brain.flags.env SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_SERVICE_ROLE_KEY=... NONPROD_STAFF_PASSWORD=... node backend-core/src/scripts/nonprod/seedNonprodSynthetic.mjs
 */
import { createClient } from "@supabase/supabase-js";

import { DEFAULT_ORGANIZATION_KEY } from "../../organizations/organizationContext.js";

export const NONPROD_ORG_ID = "5e1f0000-0000-4000-8000-000000000001";
export const NONPROD_STAFF_EMAIL = "staff@nonprod.eliteos.local";
export const NONPROD_COMPANY = "Elite Stone TEST (simulated)";

const url = String(process.env.SUPABASE_URL || "");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const password = String(process.env.NONPROD_STAFF_PASSWORD || "");
if (!url || !key || password.length < 12) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and NONPROD_STAFF_PASSWORD (12+ chars) are required.");
  process.exit(2);
}
if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname)) {
  console.error("REFUSED: seed only runs against a loopback Supabase.");
  process.exit(2);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function must(p, what) {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

const CONCEPTS = [
  ["installed_countertop_package", "SIM-ITEM-CT", "Countertops:Installed Package"],
  ["room_material", "SIM-ITEM-RM", "Countertops:Material"],
  ["kitchen_sink_cutout", "SIM-ITEM-KSC", "Fabrication:Kitchen Sink Cutout"],
  ["vanity_sink_cutout", "SIM-ITEM-VSC", "Fabrication:Vanity Sink Cutout"],
  ["vanity_bar_sink_cutout", "SIM-ITEM-BSC", "Fabrication:Bar Sink Cutout"],
  ["cooktop_cutout", "SIM-ITEM-CC", "Fabrication:Cooktop Cutout"],
  ["electrical_outlet_cutout", "SIM-ITEM-EO", "Fabrication:Outlet Cutout"],
  ["popup_outlet_cutout", "SIM-ITEM-PO", "Fabrication:Pop-up Outlet Cutout"],
  ["faucet_hole", "SIM-ITEM-FH", "Fabrication:Faucet Hole"],
  ["waterfall", "SIM-ITEM-WF", "Fabrication:Waterfall"],
  ["sink_product", "SIM-ITEM-SINK", "Products:Sink"],
  ["tear_out", "SIM-ITEM-TO", "Services:Tear-out"],
  ["customer_credit", "SIM-ITEM-CR", "Adjustments:Credit"],
  ["addon:*", "SIM-ITEM-ADD", "Fabrication:Other"],
  ["project:*", "SIM-ITEM-PRJ", "Services:Project"]
];

/** Public routes resolve the default organization key, so the local synthetic org carries it. */
async function seedOrg() {
  await must(
    db.from("organizations").upsert({ id: NONPROD_ORG_ID, organization_key: DEFAULT_ORGANIZATION_KEY, display_name: "Synthetic Fabricator (non-prod)" }, { onConflict: "id" }),
    "organization"
  );
}

async function seedStaff() {
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  let user = list?.users?.find((u) => u.email === NONPROD_STAFF_EMAIL) || null;
  if (!user) {
    const { data, error } = await db.auth.admin.createUser({ email: NONPROD_STAFF_EMAIL, password, email_confirm: true, user_metadata: { full_name: "Synthetic Staff" } });
    if (error) throw new Error(`auth user: ${error.message}`);
    user = data.user;
  } else {
    await db.auth.admin.updateUserById(user.id, { password });
  }
  await must(
    db.from("user_profiles").upsert(
      { id: user.id, email: NONPROD_STAFF_EMAIL, full_name: "Synthetic Staff", role: "admin", is_active: true, user_kind: "internal", organization_id: NONPROD_ORG_ID },
      { onConflict: "id" }
    ),
    "user profile"
  );
  return user.id;
}

async function seedSalesOrderConfig() {
  await must(
    db.from("organization_integration_configs").upsert(
      {
        organization_id: NONPROD_ORG_ID,
        integration_key: "quickbooks_sales_order",
        is_enabled: true,
        config: {
          companyIdentity: NONPROD_COMPANY,
          termsFullName: "Due on receipt",
          // Synthetic placeholder so the simulator path can run. Real tax policy is unresolved.
          salesTaxCodeByConcept: Object.fromEntries(CONCEPTS.map(([c]) => [c, "SIM-NON"])),
          synthetic: true
        }
      },
      { onConflict: "organization_id,integration_key" }
    ),
    "sales order config"
  );
  for (const [concept, listId, fullName] of CONCEPTS) {
    const { data: existing } = await db
      .from("quote_qb_item_mappings")
      .select("id")
      .eq("organization_id", NONPROD_ORG_ID)
      .eq("eliteos_concept_key", concept)
      .maybeSingle();
    if (existing) continue;
    await must(
      db.from("quote_qb_item_mappings").insert({ organization_id: NONPROD_ORG_ID, eliteos_concept_key: concept, qb_list_id: listId, qb_full_name: fullName, pricing_source: "none", is_active: true }),
      `mapping ${concept}`
    );
  }
}

async function seedAccount(displayName, listId, jobs = []) {
  const { data: found } = await db
    .from("account_directory_accounts")
    .select("id")
    .eq("organization_id", NONPROD_ORG_ID)
    .eq("display_name", displayName)
    .maybeSingle();
  const account = found || (await must(db.from("account_directory_accounts").insert({ organization_id: NONPROD_ORG_ID, display_name: displayName, status: "active" }).select("id").single(), displayName));
  const { data: link } = await db
    .from("account_directory_external_links")
    .select("id")
    .eq("organization_id", NONPROD_ORG_ID)
    .eq("account_id", account.id)
    .eq("external_system", "quickbooks_desktop")
    .maybeSingle();
  if (!link) {
    await must(db.from("account_directory_external_links").insert({ organization_id: NONPROD_ORG_ID, account_id: account.id, external_system: "quickbooks_desktop", external_id: listId, is_active: true }), "link");
  }
  const facts = [
    { organization_id: NONPROD_ORG_ID, qb_list_id: listId, full_name: displayName, is_job: false, is_active: true },
    ...jobs.map(([jobListId, jobName]) => ({ organization_id: NONPROD_ORG_ID, qb_list_id: jobListId, full_name: `${displayName}:${jobName}`, is_job: true, parent_list_id: listId, is_active: true }))
  ];
  for (const f of facts) {
    const { data: have } = await db.from("ad_qb_customer_facts").select("qb_list_id").eq("organization_id", NONPROD_ORG_ID).eq("qb_list_id", f.qb_list_id).maybeSingle();
    if (!have) await must(db.from("ad_qb_customer_facts").insert(f), `fact ${f.qb_list_id}`);
  }
  return account.id;
}

await seedOrg();
const staffId = await seedStaff();
await seedSalesOrderConfig();
const homes = await seedAccount("Synthetic Homes LLC", "SIM-CUST-100");
const builders = await seedAccount("Synthetic Builders Inc", "SIM-CUST-200", [
  ["SIM-CUST-201", "Lot 12 Kitchen"],
  ["SIM-CUST-202", "Lot 14 Baths"]
]);

console.log(JSON.stringify({ organizationId: NONPROD_ORG_ID, staffEmail: NONPROD_STAFF_EMAIL, staffUserId: staffId, accounts: { homes, builders }, company: NONPROD_COMPANY }, null, 2));
