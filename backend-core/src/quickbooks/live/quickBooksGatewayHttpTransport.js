/**
 * HTTP transport for CData QuickBooks Desktop Gateway / Remote Connector.
 *
 * Speaks the Gateway's QBXML-over-HTTP protocol (Basic Auth + XML body).
 * Does NOT require a commercial CData JDBC/ADO.NET/ODBC driver npm package —
 * only Node + axios (already in repo) + a reachable Gateway.
 *
 * READ-ONLY: refuses write/modify/delete QBXML before send.
 */

import fs from "node:fs";
import https from "node:https";
import axios from "axios";

import { assertQuickBooksLiveReadReady, summarizeGatewayConfig } from "./quickBooksGatewayConfig.js";
import { assertReadOnlyQbXml } from "./quickBooksLiveQbxml.js";

/**
 * @typedef {{
 *   postQbXml: (qbXml: string, meta?: object) => Promise<{ status: number, body: string, headers: Record<string,string> }>,
 *   describe: () => object,
 * }} QuickBooksGatewayTransport
 */

/**
 * Build HTTPS agent options from QB_GATEWAY_SSL_SERVER_CERT.
 * Supports:
 *   - absolute/relative path to a PEM file
 *   - inline PEM text (-----BEGIN CERTIFICATE-----)
 *   - "insecure" (explicitly disables TLS verification — local smoke only)
 *
 * @param {string|null} sslServerCert
 */
export function buildTlsOptions(sslServerCert) {
  if (!sslServerCert) {
    return { rejectUnauthorized: true };
  }
  const value = sslServerCert.trim();
  if (value.toLowerCase() === "insecure") {
    return { rejectUnauthorized: false, insecureExplicit: true };
  }
  if (value.includes("BEGIN CERTIFICATE")) {
    return { ca: value, rejectUnauthorized: true };
  }
  // Treat as filesystem path
  const pem = fs.readFileSync(value, "utf8");
  return { ca: pem, rejectUnauthorized: true };
}

/**
 * Create the live Gateway HTTP transport.
 *
 * @param {import('./quickBooksGatewayConfig.js').QuickBooksGatewayConfig} [config]
 * @param {{ axiosImpl?: typeof axios }} [deps]
 * @returns {QuickBooksGatewayTransport}
 */
export function createQuickBooksGatewayHttpTransport(config, deps = {}) {
  const ready = assertQuickBooksLiveReadReady(config);
  const axiosImpl = deps.axiosImpl || axios;
  const tls = buildTlsOptions(ready.sslServerCert);
  const httpsAgent =
    ready.gatewayUrl.startsWith("https:")
      ? new https.Agent({
          rejectUnauthorized: tls.rejectUnauthorized !== false,
          ca: tls.ca,
        })
      : undefined;

  const authToken = Buffer.from(`${ready.user}:${ready.password}`, "utf8").toString("base64");

  return {
    describe() {
      return {
        transport: "gateway-http-qbxml",
        ...summarizeGatewayConfig(ready),
        tlsInsecure: Boolean(tls.insecureExplicit),
      };
    },

    /**
     * POST a read-only QBXML document to the Gateway.
     * @param {string} qbXml
     */
    async postQbXml(qbXml) {
      assertReadOnlyQbXml(qbXml);

      const response = await axiosImpl.request({
        method: "POST",
        url: ready.gatewayUrl,
        data: qbXml,
        timeout: ready.requestTimeoutMs,
        httpsAgent,
        validateStatus: () => true,
        headers: {
          Authorization: `Basic ${authToken}`,
          "Content-Type": "application/x-qbxml",
          Accept: "application/x-qbxml, text/xml, application/xml, text/plain, */*",
          Connection: "close",
        },
        // Prevent axios from transforming XML
        transformResponse: [(data) => data],
        responseType: "text",
      });

      const headers = {};
      for (const [k, v] of Object.entries(response.headers || {})) {
        if (typeof v === "string") headers[k.toLowerCase()] = v;
      }

      return {
        status: response.status,
        body: typeof response.data === "string" ? response.data : String(response.data ?? ""),
        headers,
      };
    },
  };
}

/**
 * In-memory fake transport for tests — never touches network.
 * @param {(qbXml: string) => string|Promise<string>} handler
 * @returns {QuickBooksGatewayTransport}
 */
export function createFakeGatewayTransport(handler) {
  return {
    describe() {
      return { transport: "fake", enabled: true };
    },
    async postQbXml(qbXml) {
      assertReadOnlyQbXml(qbXml);
      const body = await handler(qbXml);
      return { status: 200, body: String(body), headers: { "content-type": "text/xml" } };
    },
  };
}
