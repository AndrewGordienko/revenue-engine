// message-validator.js — one place every message passes through. Deterministic. The hard
// transform (strip em/en dashes) runs on every draft so a dash can never reach the founder;
// the lint returns structured warnings (length band by message kind, banned phrases,
// must-not-claim leakage) so the writer/UI can flag weak drafts instead of shipping them.
const DASH = /[–—]/;

// Replace em/en dashes with grammar that reads naturally. Safe to run on any message.
export function stripDashes(s) {
  return String(s == null ? "" : s)
    .replace(/\s*[–—]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",");
}

// Banned phrases are conservative and evidence-based. NOTE: "caught my eye" is deliberately
// NOT banned — it appears in a message that booked a call. Ban only tired filler.
export const BANNED_PHRASES = ["synergy", "pick your brain", "circle back", "touch base", "reaching out to see if", "hope this finds you well"];

// Word bands per message kind — quality depends on the message's JOB, not one global range.
const WORD_BANDS = { connection_note: [0, 55], direct_message: [70, 150], follow_up: [30, 90], reply: [15, 90] };

export function lintMessage(body, { message_kind = "direct_message", must_not_claim = [] } = {}) {
  const text = String(body || "");
  const warnings = [];
  if (DASH.test(text)) warnings.push("contains an em or en dash");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  if (message_kind === "connection_note" && text.length > 299) warnings.push(`connection note is ${text.length} chars (max 299)`);
  const band = WORD_BANDS[message_kind];
  if (band && (words < band[0] || words > band[1])) warnings.push(`word count ${words} is outside ${band[0]}-${band[1]} for ${message_kind}`);
  for (const p of BANNED_PHRASES) if (new RegExp(`\\b${p}\\b`, "i").test(text)) warnings.push(`banned phrase: "${p}"`);
  for (const c of (must_not_claim || [])) if (c && text.toLowerCase().includes(String(c).toLowerCase())) warnings.push(`asserts a must-not-claim: "${c}"`);
  if (message_kind === "connection_note" && /https?:\/\//i.test(text)) warnings.push("URL in a connection note");
  return { ok: warnings.length === 0, warnings, words, chars: text.length };
}
