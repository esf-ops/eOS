/**
 * Digital Estimate configuration view routing — unit tests.
 */
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  decideConfigurationView,
  isConfigurationUiKillSwitchOff
} from "./configurationBootstrap.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

{
  assert.equal(isConfigurationUiKillSwitchOff(undefined), true, "unset flag enables configure path");
  assert.equal(isConfigurationUiKillSwitchOff(""), true);
  assert.equal(isConfigurationUiKillSwitchOff("true"), true);
  assert.equal(isConfigurationUiKillSwitchOff("false"), false, "exact false is kill-switch");
  assert.equal(isConfigurationUiKillSwitchOff("FALSE"), true, "case-sensitive kill-switch");
  console.log("ok: configuration UI kill-switch semantics");
}

{
  const eligible = decideConfigurationView({
    uiEnabled: true,
    lifecycle: "active",
    hasConfiguration: true,
    hasEstimate: true
  });
  assert.equal(eligible.mode, "configure");
  assert.equal(eligible.fallbackReason, null);
  console.log("ok: newly published eligible estimate → ConfigurationView");
}

{
  const legacy = decideConfigurationView({
    uiEnabled: true,
    lifecycle: "blocked",
    hasConfiguration: false,
    hasEstimate: true
  });
  assert.equal(legacy.mode, "legacy");
  assert.equal(legacy.fallbackReason, "lifecycle_not_active");
  console.log("ok: incompatible / no-envelope publication → safe legacy");
}

{
  const absent = decideConfigurationView({
    uiEnabled: true,
    lifecycle: "active",
    hasConfiguration: false,
    hasEstimate: true
  });
  assert.equal(absent.mode, "legacy");
  assert.equal(absent.fallbackReason, "configuration_absent");
  console.log("ok: active session without configuration → legacy");
}

{
  const flagged = decideConfigurationView({
    uiEnabled: false,
    lifecycle: "active",
    hasConfiguration: true,
    hasEstimate: true
  });
  assert.equal(flagged.mode, "legacy");
  assert.equal(flagged.fallbackReason, "ui_flag_disabled");
  console.log("ok: explicit UI kill-switch → legacy with explicit reason");
}

{
  const app = readFileSync(join(__dirname, "App.tsx"), "utf8");
  const api = readFileSync(join(__dirname, "publicConfigApi.ts"), "utf8");
  const boot = readFileSync(join(__dirname, "configurationBootstrap.ts"), "utf8");
  assert.ok(app.includes("exchangeFragmentToken(accessToken)"));
  assert.equal(
    /if \(configurationUiEnabled\(\)\) \{\s*try \{\s*const state = await exchangeFragmentToken/.test(
      app
    ),
    false,
    "UI flag must not gate v2 session exchange"
  );
  assert.ok(app.includes("decideConfigurationView"));
  assert.ok(app.includes("de-fallback-reason") || app.includes("fallbackReason"));
  assert.ok(app.includes("isDevDiagnosticsEnabled"));
  assert.ok(api.includes('!== "false"'));
  assert.ok(boot.includes("ui_flag_disabled"));
  assert.ok(boot.includes("configuration_absent"));
  console.log("ok: App always exchanges; flag only gates ConfigurationView entry");
}

console.log("\nAll configuration routing tests passed.\n");
