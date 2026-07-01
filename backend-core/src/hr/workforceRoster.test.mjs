import assert from "node:assert/strict";
import {
  parseWorkforceEmployeeKey,
  workforceEmployeeKey,
  WORKFORCE_TEST_ROSTER
} from "./workforceRoster.js";
import { workforceRefFromDbRow, workforceRefToDbColumns } from "./workforceTeamLoad.js";

assert.equal(WORKFORCE_TEST_ROSTER.length, 5);

const key = workforceEmployeeKey("a1000001-0001-4001-8001-000000000001", "roster");
assert.equal(parseWorkforceEmployeeKey(key)?.source, "roster");
assert.equal(parseWorkforceEmployeeKey("user:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")?.source, "user");
assert.equal(parseWorkforceEmployeeKey("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")?.source, "user");

const rosterCols = workforceRefToDbColumns({ source: "roster", id: "a1000001-0001-4001-8001-000000000001" });
assert.equal(rosterCols.employee_user_id, null);
assert.ok(rosterCols.employee_roster_id);

const userCols = workforceRefToDbColumns({ source: "user", id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
assert.ok(userCols.employee_user_id);
assert.equal(userCols.employee_roster_id, null);

assert.deepEqual(workforceRefFromDbRow({ employee_roster_id: "x", employee_user_id: null }), {
  source: "roster",
  id: "x"
});

console.log("workforceRoster.test.mjs: ok");
