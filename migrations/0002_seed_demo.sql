-- Fictional demo data for local development and the public demo.
-- Safe to re-run: existing rows are ignored.

INSERT OR IGNORE INTO users (id, email)
VALUES ('usr_demo', 'demo@mailpilot.local');

INSERT OR IGNORE INTO gmail_accounts (id, user_id, email, encrypted_refresh_token)
VALUES
  ('acc_northwind', 'usr_demo', 'hello@northwind.studio', NULL),
  ('acc_personal', 'usr_demo', 'rakib@personalmail.com', NULL);

INSERT OR IGNORE INTO email_records
  (id, account_id, gmail_message_id, thread_id, sender_name, sender_email,
   subject, preview, category, priority, summary, received_at, unread)
VALUES
  ('em_001', 'acc_northwind', 'demo_001', 'thr_001', 'Amara Okafor',
   'amara@northwind.studio', 'Landing page revisions — round 2',
   'The hero section looks great now. Two small changes before we ship…',
   'Work', 'High',
   'Client approved the hero redesign and requested two final copy tweaks before launch on Friday.',
   '2026-11-20T09:12:00Z', 1),
  ('em_002', 'acc_northwind', 'demo_002', 'thr_002', 'Stripe',
   'receipts@stripe.com', 'Your invoice for November is available',
   'Invoice #INV-2291 for $48.00 has been paid successfully.',
   'Finance', 'Medium',
   'Monthly Stripe invoice of $48.00 was charged successfully. No action needed; keep for records.',
   '2026-11-19T16:40:00Z', 0),
  ('em_003', 'acc_personal', 'demo_003', 'thr_003', 'Nadia Rahman',
   'nadia.rahman@gmail.com', 'Dinner on Saturday?',
   'We are thinking of trying that new place near the river…',
   'Personal', 'Low',
   'Friend invites you to dinner Saturday evening and asks you to confirm by Thursday.',
   '2026-11-19T11:05:00Z', 1),
  ('em_004', 'acc_northwind', 'demo_004', 'thr_004', 'Daniel Reyes',
   'daniel@brightpath.co', 'Re: API access for staging environment',
   'We still cannot reach the staging endpoint. Attaching the error log…',
   'Support', 'High',
   'Client reports staging API still unreachable and attached an error log. Needs a fix or status update today.',
   '2026-11-19T08:20:00Z', 0),
  ('em_005', 'acc_personal', 'demo_005', 'thr_005', 'Figma',
   'no-reply@figma.com', 'What''s new in Figma — November',
   'New variables workflow, faster prototyping, and more.',
   'Promotions', 'Low',
   'Product newsletter announcing Figma feature updates. No action required.',
   '2026-11-18T19:02:00Z', 0),
  ('em_006', 'acc_northwind', 'demo_006', 'thr_006', 'Priya Nair',
   'priya@lumenlabs.io', 'Contract renewal — needs signature',
   'Attached is the renewed retainer agreement for the next six months.',
   'Work', 'High',
   'Client sent a six-month retainer renewal for signature. Deadline is end of this week.',
   '2026-11-18T14:31:00Z', 1),
  ('em_007', 'acc_personal', 'demo_007', 'thr_007', 'City Bank',
   'alerts@citybank.com', 'Unusual login attempt blocked',
   'We blocked a sign-in attempt from an unrecognized device.',
   'Finance', 'Medium',
   'Bank blocked an unrecognized login attempt. Verify account activity and consider changing the password.',
   '2026-11-17T22:47:00Z', 0),
  ('em_008', 'acc_northwind', 'demo_008', 'thr_008', 'Tomas Lind',
   'tomas@fieldnote.app', 'Intro call follow-up',
   'Great speaking today. Sharing the notes and next steps we agreed…',
   'Other', 'Medium',
   'Prospect shared call notes and proposed a scoping meeting next week. Reply with availability.',
   '2026-11-17T09:15:00Z', 0);
