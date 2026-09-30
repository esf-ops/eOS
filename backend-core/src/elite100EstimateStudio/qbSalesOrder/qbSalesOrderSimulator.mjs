/**
 * SIMULATED QuickBooks Desktop company for local tests and local browser runs.
 * Speaks the same qbXML subset the sales order pipeline uses (CompanyQuery,
 * SalesOrderAdd, SalesOrderQuery). Holds state in memory only.
 *
 * Never a production path: the real connector refuses to start in simulator mode
 * unless QB_CONNECTOR_MODE=simulator is set explicitly on a non-production host.
 */
import { XMLParser } from "fast-xml-parser";

/**
 * @param {{
 *   companyName?: string,
 *   items?: Array<{ listId?: string, fullName?: string }>|null,
 *   customers?: Array<string|{ listId: string, fullName: string }>|null,
 *   startSeq?: number
 * }} [opts] when `items` / `customers` are given, unknown references fail with 3140 like QuickBooks.
 *   `startSeq` must differ between processes that report into the same Brain, because TxnIDs are
 *   unique per company there and this state does not survive a restart.
 */
export function createQuickBooksSimulator({ companyName = "Elite Stone TEST (simulated)", items = null, customers = null, startSeq = 1000 } = {}) {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
  const state = {
    companyName,
    salesOrders: [],
    requests: [],
    downNext: 0,
    dropAckNext: 0,
    addStatus: null,
    taxCents: 0,
    seq: startSeq
  };
  const money = (c) => (c / 100).toFixed(2);
  const xmlEsc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const soXml = (so) =>
    `<SalesOrderRet><TxnID>${so.txnId}</TxnID><RefNumber>${so.refNumber}</RefNumber>` +
    `<CustomerRef>${so.customerListId ? `<ListID>${xmlEsc(so.customerListId)}</ListID>` : ""}<FullName>${xmlEsc(so.customer)}</FullName></CustomerRef>` +
    `<Subtotal>${money(so.subtotalCents)}</Subtotal><SalesTaxTotal>${money(so.taxCents)}</SalesTaxTotal>` +
    `<TotalAmount>${money(so.subtotalCents + so.taxCents)}</TotalAmount>` +
    `<Memo>${xmlEsc(so.memo)}</Memo><ExternalGUID>${so.externalGuid}</ExternalGUID>` +
    so.lines
      .map(
        (l) =>
          `<SalesOrderLineRet><ItemRef>${l.listId ? `<ListID>${xmlEsc(l.listId)}</ListID>` : ""}<FullName>${xmlEsc(l.item)}</FullName></ItemRef>` +
          `<Amount>${money(l.amountCents)}</Amount></SalesOrderLineRet>`
      )
      .join("") +
    `</SalesOrderRet>`;
  const wrap = (inner) => `<?xml version="1.0"?><QBXML><QBXMLMsgsRs>${inner}</QBXMLMsgsRs></QBXML>`;
  const cents = (v) => Math.round(Number(v) * 100);

  function handle(xml) {
    state.requests.push(xml);
    if (state.downNext > 0) {
      state.downNext -= 1;
      throw new Error("connect ETIMEDOUT (VM offline)");
    }
    if (xml.includes("<CompanyQueryRq")) {
      return wrap(`<CompanyQueryRs statusCode="0"><CompanyRet><CompanyName>${xmlEsc(state.companyName)}</CompanyName></CompanyRet></CompanyQueryRs>`);
    }
    if (xml.includes("<SalesOrderAddRq")) {
      if (state.addStatus) {
        const st = state.addStatus;
        state.addStatus = null;
        return wrap(`<SalesOrderAddRs statusCode="${st.code}" statusMessage="${xmlEsc(st.message)}"></SalesOrderAddRs>`);
      }
      const add = parser.parse(xml).QBXML.QBXMLMsgsRq.SalesOrderAddRq.SalesOrderAdd;
      const lines = [].concat(add.SalesOrderLineAdd).map((l) => {
        const known = items?.find((i) => (l.ItemRef.ListID ? i.listId === l.ItemRef.ListID : i.fullName === l.ItemRef.FullName));
        return {
          listId: l.ItemRef.ListID || known?.listId || null,
          item: l.ItemRef.FullName || known?.fullName || l.ItemRef.ListID,
          known: items ? Boolean(known) : true,
          amountCents: cents(l.Amount)
        };
      });
      const badItem = lines.find((l) => !l.known);
      if (badItem) {
        return wrap(`<SalesOrderAddRs statusCode="3140" statusMessage="There is an invalid reference to QuickBooks Item &quot;${xmlEsc(badItem.listId || badItem.item)}&quot; in the SalesOrder line."></SalesOrderAddRs>`);
      }
      const ref = add.CustomerRef;
      const knownCustomer = customers?.find((c) =>
        typeof c === "string" ? c === ref.FullName : ref.ListID ? c.listId === ref.ListID : c.fullName === ref.FullName
      );
      const customerName = ref.FullName || (typeof knownCustomer === "object" ? knownCustomer.fullName : null) || ref.ListID;
      if (customers && !knownCustomer) {
        return wrap(`<SalesOrderAddRs statusCode="3140" statusMessage="There is an invalid reference to QuickBooks Customer &quot;${xmlEsc(ref.ListID || customerName)}&quot;."></SalesOrderAddRs>`);
      }
      const so = {
        txnId: `SIM-${state.seq}`,
        refNumber: String(state.seq++),
        customer: customerName,
        customerListId: ref.ListID || (typeof knownCustomer === "object" ? knownCustomer.listId : null),
        memo: add.Memo,
        externalGuid: add.ExternalGUID,
        lines,
        subtotalCents: lines.reduce((s, l) => s + l.amountCents, 0),
        taxCents: state.taxCents
      };
      state.salesOrders.push(so);
      if (state.dropAckNext > 0) {
        state.dropAckNext -= 1;
        throw new Error("socket hang up after send");
      }
      return wrap(`<SalesOrderAddRs statusCode="0">${soXml(so)}</SalesOrderAddRs>`);
    }
    if (xml.includes("<SalesOrderQueryRq")) {
      const q = parser.parse(xml).QBXML.QBXMLMsgsRq.SalesOrderQueryRq;
      const matches = q.TxnID
        ? state.salesOrders.filter((s) => s.txnId === q.TxnID)
        : q.EntityFilter?.ListID
          ? state.salesOrders.filter((s) => s.customerListId === q.EntityFilter.ListID)
          : state.salesOrders.filter((s) => s.customer === q.EntityFilter?.FullName);
      return wrap(`<SalesOrderQueryRs statusCode="${matches.length ? 0 : 1}">${matches.map(soXml).join("")}</SalesOrderQueryRs>`);
    }
    throw new Error(`simulator: unsupported request ${xml.slice(0, 80)}`);
  }

  return {
    state,
    handle,
    transport: {
      async postQbXml(xml) {
        return { status: 200, body: handle(xml) };
      }
    }
  };
}
