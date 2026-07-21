// Proves the message validator: dashes are stripped, and lint flags length-band, banned
// phrases, and must-not-claim leakage by message kind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripDashes, lintMessage } from "./message-validator.js";

test("stripDashes removes em/en dashes and reads naturally", () => {
  assert.equal(stripDashes("Hi Sam — quick one."), "Hi Sam, quick one.");
  assert.equal(stripDashes("a – b — c"), "a, b, c");
  assert.doesNotMatch(stripDashes("one — two – three"), /[–—]/);
});

test("lint flags a dash, over-length connection note, and a must-not-claim", () => {
  assert.ok(!lintMessage("Hi — there", { message_kind: "connection_note" }).ok);
  const long = "x".repeat(320);
  assert.ok(lintMessage(long, { message_kind: "connection_note" }).warnings.some((w) => /299/.test(w)));
  const claim = lintMessage("We guarantee 99.99 percent uptime for you.", { message_kind: "direct_message", must_not_claim: ["guarantee"] });
  assert.ok(claim.warnings.some((w) => /must-not-claim/.test(w)));
});

test("word bands are per message kind, and clean copy passes", () => {
  const good = "Hi Ada, thanks for connecting. I have been looking more closely at your platform and I am genuinely curious what the engineering behind it looks like day to day, the kind of problems that are hard to get right when you are reflecting a lot of moving state in real time across very different customer environments. I run a small senior software and AI team. Rather than guess where we would fit, I would love to hear what your team is working on right now and where delivery tends to slow down. Open to a quick call next week? I am not coming with a deck.";
  assert.equal(lintMessage(good, { message_kind: "direct_message" }).ok, true);
  assert.ok(lintMessage("too short", { message_kind: "direct_message" }).warnings.some((w) => /word count/.test(w)));
  assert.ok(lintMessage("Let's circle back and find some synergy.", { message_kind: "reply" }).warnings.some((w) => /banned/.test(w)));
});
