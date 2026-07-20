import assert from "node:assert/strict";
import test from "node:test";
import { readLeads } from "./leads-store.js";
import { buildLinkedinProspects, validateLinkedinProspects } from "./linkedin-prospects.js";

for (const [product, expected] of Object.entries({ gnk: 30, outagehub: 30, morrow: 30 })) {
  test(`${product} prospect desk has verified profiles and send-safe notes`, async () => {
    const prospects = await buildLinkedinProspects(await readLeads(product), product, 30);
    assert.deepEqual(validateLinkedinProspects(prospects, expected), []);
    assert.equal(prospects.length, expected);
    assert.equal(new Set(prospects.map((item) => item.profile_url)).size, expected);

    for (const item of prospects) {
      assert.match(item.profile_url, /^https:\/\/[a-z]{0,3}\.?linkedin\.com\/in\//i);
      assert.equal(item.profile_status, "verified");
      assert.ok(item.observed_signal);
      assert.ok(item.why_this_person);
      assert.ok(item.what_we_can_do);
      assert.ok(item.message.length > 0 && item.message.length <= 299);
      assert.doesNotMatch(item.message, /[\u2013\u2014]/);
    }
  });
}
