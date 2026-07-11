// Draft-only mode is the DEFAULT and the safe state. Actually sending email is a
// separate, deliberate milestone that must be turned on explicitly. Every path
// that could deliver a message to a real recipient routes through this guard, so
// there is exactly one switch and no way to send by accident.
//
// The system may always: research, verify contacts, write/review sequences, queue
// for approval, and create Gmail *drafts*. It may never call a provider *send*
// method unless OUTBOUND_SENDING_ENABLED is explicitly "1" / "true".

export function sendingEnabled(env = process.env) {
  const flag = String(env.OUTBOUND_SENDING_ENABLED ?? "").trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

// Throws unless outbound sending has been deliberately enabled. Callers place this
// as the FIRST statement in any provider send path so nothing (no DB lookup, no
// token fetch, no network call) happens in draft-only mode.
export function assertSendingEnabled(context = "outbound send", env = process.env) {
  if (!sendingEnabled(env)) {
    throw new Error(
      `OUTBOUND_SENDING_DISABLED: ${context} is blocked — the engine is in draft-only mode. ` +
      `Set OUTBOUND_SENDING_ENABLED=1 only when you have deliberately decided to begin outreach.`
    );
  }
}
