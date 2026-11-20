import type { EmailListItem } from "../../shared/types";

// Fictional data for UI development and offline fallback when the worker is not
// running. The same rows are seeded into D1 by migrations/0002_seed_demo.sql.
// Never replace with real inbox content inside committed fixtures.
export const mockEmails: EmailListItem[] = [
  {
    id: "em_001",
    account: "hello@northwind.studio",
    from: "Amara Okafor",
    fromEmail: "amara@northwind.studio",
    subject: "Landing page revisions — round 2",
    preview:
      "The hero section looks great now. Two small changes before we ship…",
    category: "Work",
    priority: "High",
    summary:
      "Client approved the hero redesign and requested two final copy tweaks before launch on Friday.",
    receivedAt: "2026-11-20T09:12:00Z",
    unread: true,
  },
  {
    id: "em_002",
    account: "hello@northwind.studio",
    from: "Stripe",
    fromEmail: "receipts@stripe.com",
    subject: "Your invoice for November is available",
    preview: "Invoice #INV-2291 for $48.00 has been paid successfully.",
    category: "Finance",
    priority: "Medium",
    summary:
      "Monthly Stripe invoice of $48.00 was charged successfully. No action needed; keep for records.",
    receivedAt: "2026-11-19T16:40:00Z",
    unread: false,
  },
  {
    id: "em_003",
    account: "rakib@personalmail.com",
    from: "Nadia Rahman",
    fromEmail: "nadia.rahman@gmail.com",
    subject: "Dinner on Saturday?",
    preview: "We are thinking of trying that new place near the river…",
    category: "Personal",
    priority: "Low",
    summary:
      "Friend invites you to dinner Saturday evening and asks you to confirm by Thursday.",
    receivedAt: "2026-11-19T11:05:00Z",
    unread: true,
  },
  {
    id: "em_004",
    account: "hello@northwind.studio",
    from: "Daniel Reyes",
    fromEmail: "daniel@brightpath.co",
    subject: "Re: API access for staging environment",
    preview:
      "We still cannot reach the staging endpoint. Attaching the error log…",
    category: "Support",
    priority: "High",
    summary:
      "Client reports staging API still unreachable and attached an error log. Needs a fix or status update today.",
    receivedAt: "2026-11-19T08:20:00Z",
    unread: false,
  },
  {
    id: "em_005",
    account: "rakib@personalmail.com",
    from: "Figma",
    fromEmail: "no-reply@figma.com",
    subject: "What's new in Figma — November",
    preview: "New variables workflow, faster prototyping, and more.",
    category: "Promotions",
    priority: "Low",
    summary:
      "Product newsletter announcing Figma feature updates. No action required.",
    receivedAt: "2026-11-18T19:02:00Z",
    unread: false,
  },
  {
    id: "em_006",
    account: "hello@northwind.studio",
    from: "Priya Nair",
    fromEmail: "priya@lumenlabs.io",
    subject: "Contract renewal — needs signature",
    preview:
      "Attached is the renewed retainer agreement for the next six months.",
    category: "Work",
    priority: "High",
    summary:
      "Client sent a six-month retainer renewal for signature. Deadline is end of this week.",
    receivedAt: "2026-11-18T14:31:00Z",
    unread: true,
  },
  {
    id: "em_007",
    account: "rakib@personalmail.com",
    from: "City Bank",
    fromEmail: "alerts@citybank.com",
    subject: "Unusual login attempt blocked",
    preview: "We blocked a sign-in attempt from an unrecognized device.",
    category: "Finance",
    priority: "Medium",
    summary:
      "Bank blocked an unrecognized login attempt. Verify account activity and consider changing the password.",
    receivedAt: "2026-11-17T22:47:00Z",
    unread: false,
  },
  {
    id: "em_008",
    account: "hello@northwind.studio",
    from: "Tomas Lind",
    fromEmail: "tomas@fieldnote.app",
    subject: "Intro call follow-up",
    preview: "Great speaking today. Sharing the notes and next steps we agreed…",
    category: "Other",
    priority: "Medium",
    summary:
      "Prospect shared call notes and proposed a scoping meeting next week. Reply with availability.",
    receivedAt: "2026-11-17T09:15:00Z",
    unread: false,
  },
];
