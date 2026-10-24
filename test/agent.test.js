import { test } from "node:test";
import assert from "node:assert/strict";

import { agentRespond, ruleRespond } from "../lib/agent.js";
import { beginConfirmation } from "../lib/confirmation.js";
import { parseMessage } from "../lib/parse.js";

test("doxycycline is recognized through the broad catalog", async () => {
  const result = await agentRespond("I need doxycycline by tonight", []);
  assert.equal(result.intent, "search");
  assert.equal(result.drug.toLowerCase(), "doxycycline");
  assert.equal(result.source, "catalog");
});

test("broad-catalog recognition reaches the confirmation gate", () => {
  const confirmation = beginConfirmation("doxycycline");
  assert.ok(confirmation.pending);
  assert.equal(confirmation.pending.stage, "collect_strength");
  assert.equal(confirmation.pending.entry.name.toLowerCase(), "doxycycline");
});

test("offline fallback also recognizes doxycycline", () => {
  const result = ruleRespond("doxycycline");
  assert.equal(result.intent, "search");
  assert.equal(result.drug.toLowerCase(), "doxycycline");
});

test("legacy parser uses the broad catalog", async () => {
  const result = await parseMessage("doxycycline tomorrow");
  assert.equal(result.intent, "search");
  assert.equal(result.drug.toLowerCase(), "doxycycline");
  assert.equal(result.when, "tomorrow");
});

test("another drug outside the old ten-item list works", async () => {
  const result = await agentRespond("I need gabapentin", []);
  assert.equal(result.intent, "search");
  assert.equal(result.drug.toLowerCase(), "gabapentin");
});
