import crypto from "node:crypto";
import { normalizeConnectionName } from "./linkedin-connections.js";

const SELF = "Andrew Gordienko";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MESSAGE_MARKER = /^(.+?) sent the following messages? at (.+)$/;
const FOOTER = /^(Seen by |React with$|Maximize compose field$|Attach an |Open GIF Keyboard$|Open Emoji Keyboard$|Send$|Open send options$|Page inboxes$)/;

function clean(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(day, count) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return isoDay(date);
}

function parseDateHeader(value, referenceDay) {
  const header = clean(value);
  const reference = new Date(`${referenceDay}T12:00:00Z`);
  if (header === "Today") return referenceDay;
  if (header === "Yesterday") return addDays(referenceDay, -1);
  const weekday = WEEKDAYS.indexOf(header);
  if (weekday >= 0) {
    const date = new Date(reference);
    const delta = (date.getUTCDay() - weekday + 7) % 7;
    date.setUTCDate(date.getUTCDate() - delta);
    return isoDay(date);
  }
  const match = header.match(new RegExp(`^(${MONTHS.join("|")}|${MONTHS.map((item) => item.slice(0, 3)).join("|")}) (\\d{1,2})(?:, (\\d{4}))?$`));
  if (!match) return null;
  const month = MONTHS.findIndex((item) => item === match[1] || item.startsWith(match[1]));
  let year = Number(match[3] || reference.getUTCFullYear());
  let date = new Date(Date.UTC(year, month, Number(match[2]), 12));
  if (!match[3] && date > reference) date = new Date(Date.UTC(year - 1, month, Number(match[2]), 12));
  return isoDay(date);
}

function parseClock(value) {
  const match = clean(value).match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
  if (!match) return "12:00";
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function cleanBody(lines) {
  const copy = [...lines];
  while (copy.length && !clean(copy[0])) copy.shift();
  while (copy.length && !clean(copy.at(-1))) copy.pop();
  while (copy.length && /^(🫡|👏|👍)$/.test(clean(copy[0]))) copy.shift();
  return copy.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function pageHeadline(lines, start, end) {
  return lines.slice(start, end).map(clean).filter(Boolean).filter((line) => (
    !/^(Status is |Mobile$|Active now$|•$|\d+[mhd] ago$)/i.test(line)
  )).join(" · ");
}

export function parseLinkedinChatsText(text, { referenceDay = "2026-07-15", nameHint = "" } = {}) {
  const raw = String(text || "").replace(/\r/g, "");
  const splitPages = raw.split(/(?=0 notifications total\n)/)
    .filter((page) => page.includes("Conversation List") && page.includes("Load more conversations"));
  const pages = splitPages.length ? splitPages : raw.trim() ? [raw] : [];
  const conversations = [];
  for (const page of pages) {
    const lines = page.split("\n");
    const loadIndex = lines.lastIndexOf("Load more conversations");
    let nameIndex = loadIndex >= 0 ? loadIndex + 1 : -1;
    while (nameIndex >= 0 && nameIndex < lines.length && !clean(lines[nameIndex])) nameIndex++;
    let optionsIndex = lines.findIndex((line, index) => index > Math.max(-1, nameIndex)
      && clean(line).startsWith("Open the options list in your conversation with"));
    if (optionsIndex < 0) optionsIndex = lines.findIndex((line) => clean(line).startsWith("Open the options list in your conversation with"));
    const optionsName = optionsIndex >= 0
      ? clean(lines[optionsIndex]).match(/^Open the options list in your conversation with (.+?) and Andrew Gordienko$/)?.[1] || ""
      : "";
    let name = optionsName || (nameIndex >= 0 ? clean(lines[nameIndex]) : "") || clean(nameHint);
    const headline = nameIndex >= 0 && optionsIndex > nameIndex ? pageHeadline(lines, nameIndex + 1, optionsIndex) : "";
    let activeDay = referenceDay;
    const messages = [];
    for (let index = Math.max(0, optionsIndex + 1); index < lines.length; index++) {
      const line = clean(lines[index]);
      const parsedDay = parseDateHeader(line, referenceDay);
      if (parsedDay) { activeDay = parsedDay; continue; }
      const marker = line.match(MESSAGE_MARKER);
      let sender_name;
      let sent_at_label;
      let bodyStart;
      if (marker) {
        sender_name = clean(marker[1]);
        sent_at_label = clean(marker[2]);
        bodyStart = index + 3;
      } else if (/^View .+(?:’s|'s) profile/.test(line)) {
        const senderLine = clean(lines[index + 1]);
        const time = senderLine.match(/(\d{1,2}:\d{2}\s*[AP]M)$/i);
        if (!time) continue;
        sender_name = clean(senderLine.slice(0, time.index).replace(/\s*\([^)]*\)\s*$/, ""));
        sent_at_label = clean(time[1]);
        bodyStart = index + 2;
      } else {
        continue;
      }
      let end = bodyStart;
      while (end < lines.length) {
        const candidate = clean(lines[end]);
        if (MESSAGE_MARKER.test(candidate) || /^View .+(?:’s|'s) profile/.test(candidate) || parseDateHeader(candidate, referenceDay) || FOOTER.test(candidate)) break;
        end++;
      }
      const body = cleanBody(lines.slice(bodyStart, end));
      if (body) {
        const sent_at = `${activeDay}T${parseClock(sent_at_label)}:00`;
        const direction = normalizeConnectionName(sender_name) === normalizeConnectionName(SELF) ? "outbound" : "inbound";
        const fingerprint = crypto.createHash("sha256").update(`${normalizeConnectionName(name)}|${sender_name}|${sent_at}|${body}`).digest("hex");
        messages.push({ sender_name, direction, sent_at, sent_at_label, body, source_line: index + 1, fingerprint });
      }
      index = end - 1;
    }
    if (!messages.length) continue;
    if (!name) name = messages.find((message) => message.direction === "inbound")?.sender_name || "";
    if (!name || normalizeConnectionName(name) === normalizeConnectionName(SELF)) continue;
    for (const message of messages) {
      message.fingerprint = crypto.createHash("sha256").update(`${normalizeConnectionName(name)}|${message.sender_name}|${message.sent_at}|${message.body}`).digest("hex");
    }
    conversations.push({
      identity_key: `linkedin-chat:${normalizeConnectionName(name)}`,
      name,
      headline,
      messages,
    });
  }
  return conversations;
}

function excerpt(value, limit = 220) {
  const text = clean(value);
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trim()}…`;
}

function responseTheme(messages) {
  const inbound = messages.filter((message) => message.direction === "inbound");
  if (!inbound.length) return "no_reply";
  const text = inbound.map((message) => message.body).join(" ").toLowerCase();
  if (/\b(no sorry|not interested|do not contact|don't contact|remove me)\b/.test(text)) return "negative";
  if (/\b(reach out to|speak (?:with|to)|connect you|pass(?:ed|ing)? (?:this|it) (?:to|along)|right person|better person|send (?:him|her|them) an email|(?:product manager|colleague|team) is interested)\b/.test(text)) return "referral";
  if (/\b(not sure|already (?:have|covered|use)|not physical|too busy|can't|cannot|not available|concern|problem is)\b/.test(text)) return "objection";
  if (/\b(yes|sure|happy to|would love|open to|sounds great|works|available|free|call|chat|discuss|send (?:me|it)|monday works)\b/.test(text)) return "positive";
  return "neutral";
}

function resolveScheduleDay(token, messageDay) {
  const lower = token.toLowerCase();
  if (lower === "today") return messageDay;
  if (lower === "tomorrow") return addDays(messageDay, 1);
  const weekday = WEEKDAYS.findIndex((item) => item.toLowerCase() === lower);
  if (weekday < 0) return null;
  const date = new Date(`${messageDay}T12:00:00Z`);
  let delta = (weekday - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return isoDay(date);
}

function scheduleCandidates(messages) {
  const candidates = [];
  const pattern = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[^\n]{0,70}?\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\s*(et|est|edt|pt|pst|pdt|utc|gmt)?/ig;
  messages.forEach((message, index) => {
    let match;
    while ((match = pattern.exec(message.body))) {
      const day = resolveScheduleDay(match[1], message.sent_at.slice(0, 10));
      if (!day) continue;
      let hour = Number(match[2]) % 12;
      if (match[4].toLowerCase().startsWith("p")) hour += 12;
      candidates.push({
        index,
        meeting_at: `${day}T${String(hour).padStart(2, "0")}:${match[3] || "00"}:00`,
        meeting_timezone: (match[5] || "ET").toUpperCase(),
        meeting_label: clean(match[0]),
      });
    }
  });
  return candidates;
}

export function analyzeLinkedinConversation(conversation, { product = "other", referenceDay = "2026-07-15" } = {}) {
  const messages = [...conversation.messages].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  const inbound = messages.filter((message) => message.direction === "inbound");
  const outbound = messages.filter((message) => message.direction === "outbound");
  const last = messages.at(-1);
  const theme = responseTheme(messages);
  const candidates = scheduleCandidates(messages);
  const candidate = candidates.at(-1) || null;
  const inviteSent = outbound.some((message) => /\b(?:just |already )?sent (?:over )?(?:the |a )?calendar invite\b/i.test(message.body));
  const confirmedAfterProposal = candidates.some((item) => messages.slice(item.index + 1).some((message) => (
    message.direction === "inbound" && /\b(works|sounds? great|perfect|confirmed|see you|monday works|that works)\b/i.test(message.body)
  )));
  const meeting_status = candidate ? (inviteSent || confirmedAfterProposal ? "scheduled" : "proposed") : "none";
  let status = "waiting";
  if (theme === "negative") status = "closed";
  else if (meeting_status === "scheduled") status = "meeting_booked";
  else if (last?.direction === "inbound") status = "needs_reply";
  let follow_up_at = null;
  let next_action = "Review the relationship and decide whether a new message is worthwhile.";
  if (status === "meeting_booked") {
    follow_up_at = candidate?.meeting_at || null;
    next_action = "Prepare for the call and capture the operational learning afterward.";
  } else if (meeting_status === "proposed") {
    follow_up_at = `${addDays(last.sent_at.slice(0, 10), 2)}T09:00:00`;
    next_action = "Confirm the proposed call time or offer one concrete alternative.";
  } else if (status === "needs_reply") {
    follow_up_at = `${referenceDay}T09:00:00`;
    next_action = theme === "referral" ? "Thank them and follow the referral while the context is fresh." : "Reply to the latest inbound message.";
  } else if (status === "waiting") {
    follow_up_at = `${addDays(last.sent_at.slice(0, 10), 3)}T09:00:00`;
    next_action = "Follow up with a short, specific question if no reply arrives.";
  }
  const emails = [...new Set(messages.flatMap((message) => message.body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig) || []))];
  const phones = [...new Set(messages.flatMap((message) => message.body.match(/(?:\+?\d[\d ()-]{8,}\d)/g) || []).map(clean))];
  const summary = inbound.length
    ? `${inbound.length} inbound / ${outbound.length} outbound. Latest inbound: “${excerpt(inbound.at(-1).body)}”`
    : `${outbound.length} outbound message${outbound.length === 1 ? "" : "s"}; no inbound reply captured.`;
  return {
    product,
    status,
    response_theme: theme,
    summary,
    next_action,
    follow_up_at,
    meeting_at: candidate?.meeting_at || null,
    meeting_timezone: candidate?.meeting_timezone || null,
    meeting_label: candidate?.meeting_label || null,
    meeting_status,
    contact_details: { emails, phones },
    message_count: messages.length,
    inbound_count: inbound.length,
    outbound_count: outbound.length,
    first_message_at: messages[0]?.sent_at || null,
    last_message_at: last?.sent_at || null,
    last_inbound_at: inbound.at(-1)?.sent_at || null,
    last_outbound_at: outbound.at(-1)?.sent_at || null,
  };
}

export function buildOutreachInsights(conversations) {
  const total = conversations.length;
  const replied = conversations.filter((item) => item.inbound_count > 0);
  const positive = conversations.filter((item) => ["positive", "referral"].includes(item.response_theme));
  const scheduled = conversations.filter((item) => item.meeting_status === "scheduled");
  const themes = Object.fromEntries(["positive", "referral", "objection", "negative", "neutral", "no_reply"].map((theme) => [
    theme, conversations.filter((item) => item.response_theme === theme).length,
  ]));
  const touchReplies = {};
  const lengthBins = { short: { conversations: 0, replies: 0 }, medium: { conversations: 0, replies: 0 }, long: { conversations: 0, replies: 0 } };
  for (const conversation of conversations) {
    const ordered = [...conversation.messages].sort((a, b) => a.sent_at.localeCompare(b.sent_at));
    const firstInbound = ordered.findIndex((message) => message.direction === "inbound");
    const outboundBeforeReply = firstInbound < 0 ? null : ordered.slice(0, firstInbound).filter((message) => message.direction === "outbound").length;
    if (outboundBeforeReply) touchReplies[outboundBeforeReply] = (touchReplies[outboundBeforeReply] || 0) + 1;
    const firstOutbound = ordered.find((message) => message.direction === "outbound");
    if (!firstOutbound) continue;
    const words = clean(firstOutbound.body).split(/\s+/).filter(Boolean).length;
    const bin = words <= 60 ? "short" : words <= 140 ? "medium" : "long";
    lengthBins[bin].conversations++;
    if (conversation.inbound_count > 0) lengthBins[bin].replies++;
  }
  const byProduct = Object.fromEntries(["gnk", "outagehub", "morrow", "other"].map((product) => {
    const set = conversations.filter((item) => item.product === product);
    return [product, {
      conversations: set.length,
      replied: set.filter((item) => item.inbound_count > 0).length,
      positive: set.filter((item) => ["positive", "referral"].includes(item.response_theme)).length,
      meetings: set.filter((item) => item.meeting_status === "scheduled").length,
    }];
  }));
  const lessons = [];
  const repliedAfterFollowup = Object.entries(touchReplies).filter(([touch]) => Number(touch) > 1).reduce((sum, [, count]) => sum + count, 0);
  if (repliedAfterFollowup) lessons.push(`${repliedAfterFollowup} conversation${repliedAfterFollowup === 1 ? "" : "s"} first received a reply after a follow-up; stopping after the opener would have lost those responses.`);
  const rates = Object.entries(lengthBins).filter(([, value]) => value.conversations).map(([key, value]) => ({ key, rate: value.replies / value.conversations, ...value })).sort((a, b) => b.rate - a.rate);
  if (rates.length > 1) lessons.push(`${rates[0].key[0].toUpperCase()}${rates[0].key.slice(1)} opening messages currently have the best observed reply rate (${rates[0].replies}/${rates[0].conversations}); treat this as directional because the sample is small.`);
  if (themes.objection) lessons.push(`${themes.objection} replies contained useful objections or corrections. Preserve those exact words and update targeting/copy instead of treating them as simple rejections.`);
  if (themes.referral) lessons.push(`${themes.referral} contact${themes.referral === 1 ? "" : "s"} offered routing information; referral asks are producing value even when the first person is not the buyer.`);
  return {
    total,
    replied: replied.length,
    response_rate: total ? replied.length / total : 0,
    positive: positive.length,
    scheduled: scheduled.length,
    themes,
    touch_replies: touchReplies,
    length_bins: lengthBins,
    by_product: byProduct,
    lessons,
  };
}
