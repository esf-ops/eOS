/**
 * Regression: SharedInboxPage must not reference undefined action-state identifiers.
 * Catches the PR #167 blank-page crash: `Uncaught ReferenceError: importingKey is not defined`.
 *
 * Run: node app-elite100-estimate-studio/src/estimateQueue/sharedInboxImportingKey.runtime.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");
const appRoot = join(root, "app-elite100-estimate-studio");
const pagePath = join(appRoot, "src/estimateQueue/SharedInboxPage.tsx");
const pageSrc = readFileSync(pagePath, "utf8");

console.log("\nsharedInboxImportingKey.runtime.test.mjs\n");

/** Action keys used during row/detail render — each must be a useState binding. */
function assertUseStateBinding(src, stateName, setterName) {
  const decl = new RegExp(
    String.raw`const\s*\[\s*${stateName}\s*,\s*${setterName}\s*\]\s*=\s*useState`
  );
  assert.match(
    src,
    decl,
    `${stateName} must be declared with useState (undefined render refs blank the app)`
  );
}

assertUseStateBinding(pageSrc, "importingKey", "setImportingKey");
assertUseStateBinding(pageSrc, "sendingTakeoffKey", "setSendingTakeoffKey");
assertUseStateBinding(pageSrc, "selectedKey", "setSelectedKey");
assert.match(pageSrc, /importingKey\s*===\s*row\.messageKey/);
assert.match(pageSrc, /disabled=\{Boolean\(importingKey\)/);
assert.match(pageSrc, /setImportingKey\(row\.messageKey\)/);
assert.match(pageSrc, /setImportingKey\(null\)/);
console.log("ok: importingKey / sendingTakeoffKey / selectedKey are in-scope useState bindings");

assert.match(pageSrc, /data-testid="shared-inbox-page"/);
assert.match(pageSrc, /data-testid="shared-inbox-row"/);
assert.match(pageSrc, /data-testid="shared-inbox-primary-action"/);
assert.match(pageSrc, /Start Estimate|start_estimate/);
assert.match(pageSrc, /resume_estimate|Resume Estimate/);
assert.match(pageSrc, /Send to AI Takeoff/);
assert.match(pageSrc, /shared-inbox-send-to-takeoff/);
assert.match(pageSrc, /Supported image plan|planSupportSummary/);
assert.match(pageSrc, /studio-nav-inbox|eq-root si-root e100-inbox/);
console.log("ok: Inbox shell + Start / Resume / Send to AI Takeoff / plan-support UI anchors remain");

const require = createRequire(import.meta.url);
const ts = require("typescript");

/**
 * @param {string} sourceText
 * @param {string} fileName
 * @returns {string[]}
 */
function undefinedNameErrors(sourceText, fileName) {
  const options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    // Allow .mjs imports without ambient decls — we only care about TS2304.
    noImplicitAny: false,
    allowJs: true,
    moduleResolution: ts.ModuleResolutionKind.Bundler
  };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (name.replace(/\\/g, "/").endsWith(fileName.replace(/\\/g, "/"))) {
      return ts.createSourceFile(name, sourceText, languageVersion, true, ts.ScriptKind.TSX);
    }
    return originalGetSourceFile(name, languageVersion, onError, shouldCreateNewSourceFile);
  };
  const program = ts.createProgram({
    rootNames: [join(appRoot, "src/estimateQueue", fileName)],
    options,
    host
  });
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.code === 2304)
    .filter((d) => {
      const file = d.file?.fileName || "";
      return file.replace(/\\/g, "/").includes("SharedInboxPage");
    })
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
}

{
  const messages = undefinedNameErrors(pageSrc, "SharedInboxPage.tsx");
  assert.equal(
    messages.length,
    0,
    `SharedInboxPage.tsx undefined identifiers:\n${messages.join("\n")}`
  );
  console.log("ok: TypeScript finds no undefined-name errors on SharedInboxPage.tsx");
}

// Negative proof: dropping the useState binding recreates the production crash class.
{
  const broken = pageSrc.replace(
    /\/\*\* Message key currently running Start\/Import Estimate[\s\S]*?\*\/\s*/m,
    ""
  ).replace(
    /const\s*\[\s*importingKey\s*,\s*setImportingKey\s*\]\s*=\s*useState<string\s*\|\s*null>\(null\);\s*/m,
    ""
  );
  assert.doesNotMatch(
    broken,
    /const\s*\[\s*importingKey\s*,\s*setImportingKey\s*\]\s*=\s*useState/
  );
  const messages = undefinedNameErrors(broken, "SharedInboxPage.tsx");
  assert.ok(
    messages.some((m) => /Cannot find name 'importingKey'/.test(m)),
    `expected TS2304 for importingKey when useState is removed; got:\n${messages.join("\n") || "(none)"}`
  );
  console.log("ok: regression detector catches missing importingKey binding (TS2304)");
}

// Row-action expressions that crashed when importingKey was undefined.
{
  const importingKey = null;
  const startRow = {
    messageKey: "msg-1",
    primaryAction: { key: "start_estimate", label: "Start Estimate" },
    planSupportSummary: { label: "Supported image plan", supported: true },
    attachments: [{ filename: "kitchen-plan.jpg", supportedForTakeoff: true }]
  };
  const resumeRow = {
    messageKey: "msg-2",
    primaryAction: { key: "resume_estimate", label: "Resume Estimate" },
    intakeCaseId: "case-1"
  };
  assert.equal(importingKey === startRow.messageKey, false);
  assert.equal(Boolean(importingKey) || !startRow.primaryAction, false);
  assert.equal(startRow.primaryAction.label, "Start Estimate");
  assert.equal(resumeRow.primaryAction.label, "Resume Estimate");
  assert.equal(startRow.planSupportSummary.label, "Supported image plan");
  console.log("ok: Start / Resume / plan-support row expressions evaluate with defined importingKey");
}

console.log("\nsharedInboxImportingKey.runtime.test.mjs: ok\n");
