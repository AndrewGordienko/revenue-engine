// Deterministic sequence skeleton. Sequence SHAPE (touch count, cadence, the job
// of each touch) is policy, not a judgement call, so it is generated from
// SEQUENCE_POLICIES in code instead of by an LLM. The unified sequence writer
// fills grounded content into this fixed skeleton; the old sequence-strategy
// agent is off the live path.
import { SEQUENCE_POLICIES, STRATEGY_VERSION } from "./sales-plays.js";
import { normalizeProduct } from "./lineage.js";

// Stable touch identifiers per brand, aligned 1:1 with SEQUENCE_POLICIES touches.
const TOUCH_KEYS = {
  gnk: ["trigger_and_outcome", "useful_point_of_view", "method_or_shaping", "router_close"],
  outagehub: ["workflow_pilot_hypothesis", "decision_grade_proof", "implementation_and_success", "annual_expansion", "router_close"],
};

export function sequenceSkeleton(product) {
  const p = normalizeProduct(product);
  const policy = SEQUENCE_POLICIES[p];
  const keys = TOUCH_KEYS[p];
  if (!policy || !keys) throw new Error(`no sequence policy for product ${p}`);
  if (policy.touch_count !== keys.length || policy.send_days.length !== keys.length || policy.touches.length !== keys.length) {
    throw new Error(`sequence policy for ${p} is internally inconsistent`);
  }
  return {
    product: p,
    strategy_version: STRATEGY_VERSION,
    touch_count: policy.touch_count,
    send_days: policy.send_days,
    motion: policy.motion,
    touches: keys.map((touch_key, index) => ({
      touch_number: index + 1,
      touch_key,
      send_day: policy.send_days[index],
      objective: policy.touches[index],
    })),
  };
}
