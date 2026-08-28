/**
 * Mac mini nightly LaunchAgent + wrapper contracts.
 * No live launchd. No secrets. No Moraware calls.
 *
 * Run: node deploy/moraware-worker/macosNightlyLaunchAgent.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const worker = readFileSync(join(root, "deploy/moraware-worker/run-moraware-worker.sh"), "utf8");
const facts = readFileSync(join(root, "deploy/moraware-worker/run-sales-worksheet-facts-sync.sh"), "utf8");
const incremental = readFileSync(join(root, "deploy/moraware-worker/run-moraware-incremental.sh"), "utf8");
const nightly = readFileSync(join(root, "deploy/moraware-worker/run-moraware-nightly-macos.sh"), "utf8");
const plist = readFileSync(join(root, "deploy/moraware-worker/launchd/com.eliteos.moraware-nightly.plist"), "utf8");
const pipeline = readFileSync(
  join(root, "backend-core/src/scripts/moraware/runScheduledMorawarePipeline.js"),
  "utf8"
);
const incrementalPop = readFileSync(
  join(root, "backend-core/src/moraware/morawareIncrementalPopulation.mjs"),
  "utf8"
);

assert.match(worker, /LOG_DIR="\$\{LOG_DIR:-\/var\/log\/eliteos\}"/);
assert.match(worker, /ELITEOS_REPO="\$\{ELITEOS_REPO:-\/opt\/eliteos\/eOS\}"/);
assert.match(worker, /eos:moraware:run-scheduled-pipeline/);
assert.equal(worker.includes("/Users/chrishenely"), false, "generic worker wrapper has no Mac-mini home path");

assert.match(facts, /LOG_DIR="\$\{LOG_DIR:-\/var\/log\/eliteos\}"/);
assert.equal(facts.includes("/Users/chrishenely"), false, "one-off view 219 wrapper has no Mac-mini home path");

assert.match(incremental, /eos:moraware:incremental/);
assert.equal(incremental.includes("run-scheduled-pipeline"), false);
assert.equal(incremental.includes("sync-sales-worksheet-facts"), false);
assert.equal(incremental.includes("VIEW_219"), false, "hourly incremental must not enable view 219");

assert.match(nightly, /ELITEOS_REPO="\$\{ELITEOS_REPO:-\/Users\/chrishenely\/eOS-worker\}"/);
assert.match(nightly, /ELITEOS_ENV="\$\{ELITEOS_ENV:-\/Users\/chrishenely\/\.eliteos\/moraware-worker\.env\}"/);
assert.match(nightly, /LOG_DIR="\$\{LOG_DIR:-\/Users\/chrishenely\/Library\/Logs\/eliteOS\}"/);
assert.match(nightly, /MORAWARE_VIEW_219_SYNC="\$\{MORAWARE_VIEW_219_SYNC:-1\}"/);
assert.match(nightly, /run-moraware-worker\.sh/);
assert.equal(/PASSWORD|SERVICE_ROLE|cookie/i.test(nightly), false);

assert.match(plist, /<string>com\.eliteos\.moraware-nightly<\/string>/);
assert.match(plist, /<key>StartCalendarInterval<\/key>/);
assert.match(plist, /<key>Hour<\/key>\s*<integer>1<\/integer>/);
assert.match(plist, /<key>Minute<\/key>\s*<integer>30<\/integer>/);
assert.equal(plist.includes("StartInterval"), false, "nightly must use calendar interval, not StartInterval");
assert.equal(plist.includes("run-moraware-incremental"), false, "nightly plist must not call hourly incremental");
assert.match(plist, /run-moraware-nightly-macos\.sh/);
assert.match(plist, /Library\/Logs\/eliteOS\/moraware-nightly\.stdout\.log/);
assert.match(plist, /Library\/Logs\/eliteOS\/moraware-nightly\.stderr\.log/);
assert.match(plist, /<key>RunAtLoad<\/key>\s*<false\/>/);
assert.equal(/PASSWORD|SERVICE_ROLE|cookie/i.test(plist), false);

assert.match(pipeline, /syncSalesWorksheetFactsFeed\.js/);
assert.match(pipeline, /MORAWARE_VIEW_219_SYNC/);
assert.match(pipeline, /acquireScheduledPopulationLock/);
assert.match(incrementalPop, /MORAWARE_POPULATION_LOCK_NAME/);
assert.match(incrementalPop, /acquireMorawarePopulationLock/);
assert.match(incrementalPop, /population_lock_busy/);

console.log("macosNightlyLaunchAgent.test.mjs: ok");
