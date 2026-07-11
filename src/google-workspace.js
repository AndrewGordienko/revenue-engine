const API = "https://www.googleapis.com";

function base64url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64url(value) {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

async function accessToken(env = process.env) {
  if (env.GOOGLE_ACCESS_TOKEN) return env.GOOGLE_ACCESS_TOKEN;
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google Workspace is not configured; set GOOGLE_ACCESS_TOKEN or client/secret/refresh token credentials");
  }
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
  if (!response.ok) throw new Error(`Google token refresh failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

async function googleFetch(path, options = {}, env = process.env) {
  const token = await accessToken(env);
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`Google API ${path} failed: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

function header(message, name) {
  return (message.payload?.headers || []).find((candidate) => candidate.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function messageBody(part) {
  if (part?.body?.data) return decodeBase64url(part.body.data);
  for (const child of part?.parts || []) {
    if (child.mimeType === "text/plain" && child.body?.data) return decodeBase64url(child.body.data);
  }
  for (const child of part?.parts || []) {
    const found = messageBody(child);
    if (found) return found;
  }
  return "";
}

export class GmailProvider {
  constructor({ env = process.env, sender = null } = {}) { this.env = env; this.sender = sender || env.GMAIL_SENDER || "me"; }
  async status() {
    try { const profile = await googleFetch("/gmail/v1/users/me/profile", {}, this.env); return { configured: true, email: profile.emailAddress }; }
    catch (error) { return { configured: false, error: error.message }; }
  }
  async createDraft({ recipient, subject, body }) {
    const mime = [`To: ${recipient}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", body].join("\r\n");
    const draft = await googleFetch("/gmail/v1/users/me/drafts", { method: "POST", body: JSON.stringify({ message: { raw: base64url(mime) } }) }, this.env);
    return { draft_id: draft.id, message_id: draft.message?.id, thread_id: draft.message?.threadId };
  }
  async sendDraft(draftId) {
    const sent = await googleFetch("/gmail/v1/users/me/drafts/send", { method: "POST", body: JSON.stringify({ id: draftId }) }, this.env);
    return { message_id: sent.id, thread_id: sent.threadId, sent_at: new Date(Number(sent.internalDate || Date.now())).toISOString() };
  }
  async getThread(threadId) {
    const thread = await googleFetch(`/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`, {}, this.env);
    return (thread.messages || []).map((message) => ({
      id: message.id,
      thread_id: message.threadId,
      labels: message.labelIds || [],
      from: header(message, "From"),
      to: header(message, "To"),
      subject: header(message, "Subject"),
      body: messageBody(message.payload),
      occurred_at: new Date(Number(message.internalDate || Date.now())).toISOString(),
    }));
  }
}

export class GoogleCalendarProvider {
  constructor({ env = process.env, calendarId = null } = {}) { this.env = env; this.calendarId = calendarId || env.GOOGLE_CALENDAR_ID || "primary"; }
  async status() {
    try { const calendar = await googleFetch(`/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}`, {}, this.env); return { configured: true, calendar: calendar.summary }; }
    catch (error) { return { configured: false, error: error.message }; }
  }
  async busy({ timeMin, timeMax, timeZone }) {
    const result = await googleFetch("/calendar/v3/freeBusy", { method: "POST", body: JSON.stringify({ timeMin, timeMax, timeZone, items: [{ id: this.calendarId }] }) }, this.env);
    return result.calendars?.[this.calendarId]?.busy || [];
  }
  async createMeeting({ summary, description, starts_at, ends_at, timezone, attendees }) {
    const event = await googleFetch(`/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`, {
      method: "POST",
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: starts_at, timeZone: timezone },
        end: { dateTime: ends_at, timeZone: timezone },
        attendees: attendees.map((email) => ({ email })),
        conferenceData: { createRequest: { requestId: `salesv3-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
      }),
    }, this.env);
    return { event_id: event.id, conference_url: event.hangoutLink || null, html_link: event.htmlLink || null };
  }
}

export async function googleWorkspaceStatus(env = process.env) {
  const [gmail, calendar] = await Promise.all([new GmailProvider({ env }).status(), new GoogleCalendarProvider({ env }).status()]);
  return { gmail, calendar };
}
