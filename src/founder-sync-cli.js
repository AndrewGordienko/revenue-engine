import { founderOverview, founderReconciliation, syncLinkedinOperatingLoop } from "./founder-ops.js";

const result = syncLinkedinOperatingLoop();
console.log(JSON.stringify({
  sync: result,
  reconciliation: founderReconciliation(),
  founder_metrics: founderOverview().metrics,
}, null, 2));
