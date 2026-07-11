// Deterministic execution plane — thin CLI wrappers over code that is NOT an
// agent. These never call an LLM. Sending stays disabled by the outbound guard.
//   node src/ops-cli.js mailbox:sync
//   node src/ops-cli.js reply:handle
//   node src/ops-cli.js meeting:prepare <leadId>
import { GmailProvider } from "./google-workspace.js";
import { syncGmail, listOutreachMessages } from "./outreach-queue.js";
import { buildCallBrief } from "./meetings.js";

async function main() {
  const command = process.argv[2];
  switch (command) {
    case "mailbox:sync": {
      // Observes sent/reply events from Gmail threads. Records canonical events;
      // stop-on-reply and reply classification happen inside recordRevenueEvent.
      const result = await syncGmail(new GmailProvider());
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "reply:handle": {
      // Surface the approval-gated response drafts the reply classifier produced.
      const drafts = listOutreachMessages({}).filter((message) => message.message_type === "reply_draft");
      console.log(JSON.stringify(drafts.map((d) => ({ id: d.id, lead: d.name, company: d.company, status: d.status, subject: d.subject })), null, 2));
      break;
    }
    case "meeting:prepare": {
      const leadId = process.argv[3];
      if (!leadId) throw new Error("usage: meeting:prepare <leadId>");
      console.log(JSON.stringify(buildCallBrief(leadId), null, 2));
      break;
    }
    default:
      console.error("Unknown command. Use: mailbox:sync | reply:handle | meeting:prepare <leadId>");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
