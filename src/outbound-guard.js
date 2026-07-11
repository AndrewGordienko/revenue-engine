// Outbound sending is intentionally NOT implemented in this build. The engine
// researches, verifies contacts, writes and reviews sequences, queues for
// approval, and can create Gmail *drafts* — but it has no way to send. There is
// deliberately NO configuration flag that turns sending on: making it
// configurable is exactly what would allow accidental sends. Sending will be
// reintroduced only in a dedicated, explicitly reviewed "enable outbound" change.
export const OUTBOUND_SENDING_SUPPORTED = false;

// Throws unconditionally. Placed as the FIRST statement in any provider send
// path so nothing (no DB lookup, no token fetch, no network call) can happen.
export function assertSendingUnsupported(context = "outbound send") {
  throw new Error(
    `OUTBOUND_SENDING_UNSUPPORTED: ${context} is not available in this build. ` +
    `Sending is intentionally not implemented — create a Gmail draft and send it yourself from Gmail.`
  );
}
