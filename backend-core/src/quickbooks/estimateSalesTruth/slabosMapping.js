/**
 * Field-by-field mapping between slabOS Quote Flow / Digital Estimate and
 * QuickBooks EstimateRet — discovery phase (no writes).
 */

/**
 * @param {object} ctx
 */
export function buildSlabosQbEstimateFieldMapping(ctx) {
  const { estimateProfile, estimateLineProfile, referenceUsage } = ctx;

  /** @type {Array<object>} */
  const fields = [
    map(
      "accountDirectoryAccountId → CustomerRef.ListID",
      "Account Directory quickbooks_desktop external_id (root customer ListID); jobs may be child ListIDs",
      "CustomerRef.ListID",
      "CONFIRMED_FROM_QB_DATA",
      "QB Estimates always carry CustomerRef.ListID. slabOS links accounts via Account Directory — do not invent name matching."
    ),
    map(
      "scope.projectName / DataExt Project",
      "scope.projectName or DE project.projectName",
      "DataExtRet[name=Project]",
      "STRONGLY_SUPPORTED_BY_QB_DATA",
      "Historical Estimates commonly store Project as a DataExt custom field."
    ),
    map(
      "salesperson",
      "createdByUserId / salespersonLabel (weak on Studio); no dedicated SalesRep ListID today",
      "SalesRepRef.ListID",
      "NEEDS_BUSINESS_DECISION",
      "QB SalesRepRef is common (~60%+ historically) but slabOS lacks a first-class QB SalesRep ListID mapping."
    ),
    map(
      "branch",
      "Not on studio_estimates; legacy quote_headers.branch only",
      "ClassRef.ListID",
      "NEEDS_BUSINESS_DECISION",
      "ClassRef is nearly universal on Estimates and historically encodes branch-like labels. Need org config ListID map."
    ),
    map(
      "quoteNumber",
      "SE-{shortId} on Digital Estimate publish",
      "RefNumber",
      "NEEDS_BUSINESS_DECISION",
      "Elite Stone QB RefNumbers follow YY-NNNN(N) (and older MM-DD-NNNN). slabOS SE-* must not silently overwrite QB numbering without a policy."
    ),
    map(
      "totals.customerDisplayTotal / estimatedProjectTotal",
      "calculationSnapshot.totals.customerDisplayTotal; DE totals.estimatedProjectTotal",
      "TotalAmount (and Subtotal + tax components)",
      "PROPOSED_FROM_SLABOS",
      "Map customer-facing total into QB Subtotal/TotalAmount with explicit tax policy."
    ),
    map(
      "materialUseTax (2% stone)",
      "calculationSnapshot.totals.materialUseTax",
      "ItemSalesTaxRef / SalesTaxPercentage / SalesTaxTotal / line SalesTaxCodeRef",
      "NEEDS_BUSINESS_DECISION",
      "Historical QB tax uses ItemSalesTaxRef + CustomerSalesTaxCodeRef; slabOS uses a fixed 2% material use tax model — not identical."
    ),
    map(
      "payment terms",
      "Digital Estimate terms_version / disclosures (legal), not Net-30",
      "TermsRef.ListID",
      "NEEDS_BUSINESS_DECISION",
      "QB TermsRef is nearly always populated; slabOS disclosure terms are not QB payment terms."
    ),
    map(
      "template",
      "none",
      "TemplateRef.ListID",
      "MISSING_REFERENCE_DATA",
      "TemplateRef is nearly always set (e.g. Shop Copy) but templates are not exported as a list entity."
    ),
    map(
      "PO number",
      "none in Quote Flow / Studio scope",
      "PONumber",
      "INFERRED_FROM_QB_DATA",
      "PONumber is rare on historical Estimates; optional future field."
    ),
    map(
      "customer message",
      "none dedicated",
      "CustomerMsgRef.ListID",
      "MISSING_REFERENCE_DATA",
      "CustomerMsgRef common historically; message list not in export."
    ),
    map(
      "bill/ship address",
      "scope.projectAddress / customerIdentitySnapshot / AD location",
      "BillAddress (+ rare ShipAddress)",
      "PROPOSED_FROM_SLABOS",
      "BillAddress present on nearly all Estimates; ShipAddress rare."
    ),
    map(
      "rooms/pieces/addOns commercial lines",
      "scope.rooms[], addOns, customLineItems; calc commercial lines",
      "EstimateLineRet[]",
      "INFERRED_FROM_QB_DATA",
      "Historical lines mix ItemRef priced rows and description-only rows. Exact item ListID catalog mapping is required before writeback."
    ),
    map(
      "line description",
      "piece/room labels, material/color, custom line labels",
      "EstimateLineRet.Desc",
      "INFERRED_FROM_QB_DATA",
      "Desc is common; often carries material/dimension narrative."
    ),
    map(
      "quantity / rate / amount",
      "quantity, unitPrice, lineTotal",
      "Quantity / Rate / Amount",
      "CONFIRMED_FROM_QB_DATA",
      "When all three present, Quantity*Rate≈Amount within $0.05 on nearly all priced lines."
    ),
    map(
      "line class",
      "branch proxy",
      "EstimateLineRet.ClassRef.ListID",
      "STRONGLY_SUPPORTED_BY_QB_DATA",
      "Line ClassRef usually mirrors header ClassRef."
    ),
    map(
      "line tax code",
      "customLineItems.taxable; stone tax model",
      "EstimateLineRet.SalesTaxCodeRef",
      "NEEDS_BUSINESS_DECISION",
      "Tax vs Non codes appear on priced lines; align with slabOS tax policy."
    ),
    map(
      "IsActive / IsToBeEmailed",
      "lifecycle / publication channels",
      "IsActive / IsToBeEmailed",
      "INFERRED_FROM_QB_DATA",
      "IsActive marks historical open vs closed estimates; not the same as slabOS sold/accepted."
    ),
    map(
      "acceptedAt / Digital Estimate acceptance",
      "studio_estimate_acceptances + lifecycle accepted_awaiting_sold_review",
      "(no direct QB Estimate field)",
      "PROPOSED_FROM_SLABOS",
      "Acceptance is operational/commercial truth in slabOS, not a QB Estimate field. Do not overload IsActive."
    ),
    map(
      "soldAt / Mark Sold",
      "lifecycle sold (staff checklist)",
      "Sales Order creation (candidate) — see financial truth doc",
      "NEEDS_BUSINESS_DECISION",
      "QB does not expose a single 'Sold' flag on Estimates in this export."
    ),
  ];

  return {
    generatedAt: new Date().toISOString(),
    evidenceBasis: {
      estimateCount: estimateProfile?.estimateCount ?? null,
      estimateLineCount: estimateLineProfile?.lineCount ?? null,
      missingReferenceData: referenceUsage?.missingReferenceData ?? [],
    },
    mappings: fields,
    summaryCounts: countBy(fields, "classification"),
    writebackPrerequisites: [
      "Account Directory QuickBooks ListID link for customer/job",
      "QB Item ListID map for slabOS commercial line categories",
      "QB Class ListID map for branch",
      "QB SalesRep ListID map for salesperson (if required)",
      "QB Terms + Template + CustomerMsg ListID defaults",
      "Tax policy reconciliation (QB sales tax vs slabOS 2% use tax)",
      "RefNumber policy (preserve Elite Stone YY-NNNN vs SE-* quote numbers)",
    ],
  };
}

function map(id, slabos, quickbooks, classification, notes) {
  return { id, slabosField: slabos, quickbooksField: quickbooks, classification, notes };
}

function countBy(rows, key) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const row of rows) {
    const k = row[key];
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
