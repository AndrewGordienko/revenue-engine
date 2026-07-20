// campaign-targets-data.js — the initial Morrow Windsor-Essex Tier-1 account list, as pure
// data (no imports) so db.js can seed it without an import cycle. These are deliberate
// campaign targets (aspirations), NOT leads — they make Morrow pipeline reporting non-null
// before any lead is sourced. COPACK-01 = co-packers/fulfillment; CPG-01 = grower-packer /
// CPG / food manufacturers with changeover-heavy secondary packing.
export const MORROW_WINDSOR_TARGETS = [
  // MORROW-COPACK-01 — co-packers, canning, 3PL/fulfillment
  { play_id: "MORROW-COPACK-01", company: "Highbury Canco", domain: "highburycanco.com", tier: "tier1", region: "Leamington, ON" },
  { play_id: "MORROW-COPACK-01", company: "Les Aliments Dainty Foods", domain: "dainty.ca", tier: "tier1", region: "Windsor, ON" },
  { play_id: "MORROW-COPACK-01", company: "Buske Logistics", domain: "buske.com", tier: "tier1", region: "Windsor, ON" },
  { play_id: "MORROW-COPACK-01", company: "Windsor Fulfillment Corp", domain: "windsorfulfillment.com", tier: "tier1", region: "Windsor, ON" },
  // MORROW-CPG-01 — grower-packer-shippers and CPG/food/auto manufacturers
  { play_id: "MORROW-CPG-01", company: "Mucci Farms", domain: "muccifarms.com", tier: "tier1", region: "Kingsville, ON" },
  { play_id: "MORROW-CPG-01", company: "Nature Fresh Farms", domain: "naturefresh.ca", tier: "tier1", region: "Leamington, ON" },
  { play_id: "MORROW-CPG-01", company: "Mastronardi Produce", domain: "mastronardiproduce.com", tier: "tier1", region: "Kingsville, ON" },
  { play_id: "MORROW-CPG-01", company: "Highline Mushrooms", domain: "highlinemushrooms.com", tier: "tier1", region: "Leamington, ON" },
  { play_id: "MORROW-CPG-01", company: "Plasman Group", domain: "plasman.com", tier: "tier1", region: "Windsor, ON" },
  { play_id: "MORROW-CPG-01", company: "Flex-N-Gate", domain: "flex-n-gate.com", tier: "tier1", region: "Windsor, ON" },
];
