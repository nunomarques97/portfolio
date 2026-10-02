// Case study of Repcastr, written from its private repository: CLAUDE.md (the service model, where n8n runs, spending
// and data rules), docs/DECISION.md (brand, niche, self-service sign-up, the clients table), docs/PLAN.md (phases and
// next workflows), docs/MULTI_CLIENT_ARCHITECTURE.md (clients table, invites, sign-up checks, routing, Google access)
// and docs/STATE.md (the calendar contract, the WhatsApp webhook and its signature check, test evidence, what is live,
// tracked risks and next actions).
import type { CaseStudy } from './index';
import { placeholder } from '../portfolio';

const caseStudy: CaseStudy = {
  repo: 'automacoes-n8n',
  slug: 'repcastr',
  problem: [
    'A small business that works by appointment loses money in two quiet ways: people who do not turn up, and ' +
      'people who do not come back. Reminders are often sent by hand the day before, and the no-show rate is a ' +
      'number nobody has.',
    'Repcastr is a service, not a SaaS. Ready-made n8n workflows read the business\'s own Google Calendar and ' +
      'contacts sheet, send a reminder the day before on WhatsApp with yes and no buttons, log no-shows with the ' +
      'monthly rate, and list customers who are due back with the revenue at stake.',
    'Each business signs itself up from a personal invite link and a form on repcastr.com, and one clients table ' +
      'drives every workflow.',
  ],
  constraints: [
    'No spending until there is a paying client. n8n is self-hosted on the developer\'s own laptop and reached ' +
      'through a tunnel, so the laptop has to be on for the automations to run.',
    'The business keeps working as it does today. A booking is just the customer\'s name at the appointment time, ' +
      'and a no-show or a cancellation is a colour on the event.',
    'No real customer data in the repository or the tests: the workflows are developed against a generated set of ' +
      'fake appointments, and credentials stay in n8n\'s own credential store.',
    'Never guess. A name with no contact, or with two different numbers, is skipped and logged, not sent to a number ' +
      'that might be wrong.',
    'One shared instance serves every business, so one business\'s data, settings or failure must never reach ' +
      'another.',
    "WhatsApp follows Meta's rules: a message to someone who has not written in the last 24 hours needs an " +
      'approved template, and receiving replies needs a completed production setup.',
    'Everything a customer reads is in European Portuguese.',
  ],
  diagram: {
    title: 'How Repcastr signs up a business and sends its reminders',
    description:
      'A business signs up on the site with its invite, and n8n checks the form and saves one row in the clients ' +
      'table. Every day the workflows read each active business\'s calendar and contacts and send reminders on ' +
      'WhatsApp. Replies come back to a webhook that checks the signature, recolours the booking on a no and ' +
      'alerts the owner.',
    groups: [{ id: 'n8n', label: 'n8n, self-hosted' }],
    nodes: [
      { id: 'owner', kind: 'client', label: 'Business owner', detail: 'Opens a personal invite link' },
      { id: 'site', kind: 'component', label: 'Sign-up site', detail: 'Static Astro site on Cloudflare Pages' },
      {
        id: 'onboarding',
        kind: 'component',
        group: 'n8n',
        label: 'Sign-up webhook',
        detail: 'Checks the invite, the fields and Google access',
      },
      {
        id: 'table',
        kind: 'store',
        group: 'n8n',
        label: 'Clients table',
        detail: 'n8n Data Table, one row per business',
      },
      {
        id: 'daily',
        kind: 'component',
        group: 'n8n',
        label: 'Daily workflows',
        detail: 'Reminders, no-show log, recall',
      },
      {
        id: 'google',
        kind: 'external',
        label: 'Google Calendar and Sheets',
        detail: "The business's bookings and contacts",
      },
      { id: 'whatsapp', kind: 'external', label: 'WhatsApp API', detail: 'Sends from the business\'s number' },
      { id: 'customers', kind: 'client', label: 'Customers', detail: 'Tap yes or no' },
      {
        id: 'replies',
        kind: 'component',
        label: 'Reply webhook',
        detail: "n8n: checks Meta's signature, routes by number",
      },
    ],
    edges: [
      { from: 'owner', to: 'site', label: 'Invite link and form' },
      { from: 'site', to: 'onboarding', label: 'Sign-up, with the invite' },
      { from: 'onboarding', to: 'table', label: 'New row, off until reviewed' },
      { from: 'table', to: 'daily', label: 'Active businesses only' },
      { from: 'daily', to: 'google', label: "Tomorrow's bookings and contacts" },
      { from: 'daily', to: 'whatsapp', label: 'Day-before reminders' },
      { from: 'whatsapp', to: 'customers', label: 'Reminder with yes and no buttons' },
      { from: 'customers', to: 'replies', label: 'Their answer, through Meta' },
      { from: 'replies', to: 'google', label: 'On a no, recolours the booking' },
      { from: 'replies', to: 'whatsapp', label: 'Reply, and an alert to the owner on a no' },
    ],
  },
  decisions: [
    {
      decision: 'Keep the clients in an n8n Data Table, one row per business, defined in one place in the code.',
      rejected: 'A Google Sheet as the clients table.',
      reason:
        'Every read of the most-read table would need the Google credential, so sign-up and two businesses running ' +
        'side by side could not be proven in a sandbox without credentials. The Data Table is free and needs none. ' +
        'The cost is that the rows live only in the n8n database, so it has to be backed up.',
    },
    {
      decision: 'One workflow per job that loops over every active business in a single run.',
      rejected: 'A configured copy of each workflow for each business.',
      reason:
        'With copies, every fix has to be applied again to each one by hand. Meta also allows one callback URL per ' +
        'app, so the reply webhook had to be shared and route by phone number anyway.',
    },
    {
      decision: "Receive WhatsApp replies on a plain n8n webhook that checks Meta's signature itself.",
      rejected: "n8n's built-in WhatsApp trigger.",
      reason:
        'The built-in trigger registers its subscription with an app token that never carries the permission it ' +
        'needs, so it could not work for this account. A plain webhook can be tested without Meta, and the ' +
        'signature check refuses any request it cannot verify.',
    },
    {
      decision:
        'Each business shares its calendar and contacts sheet with the operator\'s Google account, and one ' +
        'credential reads them all.',
      rejected: 'Each owner authorising the app through Google OAuth.',
      reason:
        'OAuth would mean adding every owner as a test user of the app, which is real friction for a small ' +
        'business. The cost is that one account becomes the single access point, which suits a service that the ' +
        'operator runs.',
    },
    {
      decision:
        'Sign-up needs a single-use invite that expires after 14 days. Only its SHA-256 hash is stored, and the ' +
        'link carries it in the URL fragment.',
      rejected: 'An open sign-up form.',
      reason:
        'A stranger cannot create or overwrite a business, or use the form to probe calendars with the operator\'s ' +
        'credential. The fragment is never sent to a server, so the invite does not end up in request logs.',
    },
  ],
  results: [
    'repcastr.com is live on Cloudflare Pages, with the sign-up form.',
    'Since 26 September 2026 the reminder workflow, the reply webhook and sign-up are switched on. The no-show and ' +
      'recall workflows are built but not switched on yet.',
    'Every workflow ran end to end in a sandbox of real n8n with only Google faked: two businesses in one run with ' +
      'no crossover, one business\'s failure not stopping the others, and unknown or forged requests refused.',
    'On a generated set of 800 fake appointments, the no-show and recall reports matched a separate count by hand.',
    'On 26 September 2026 the site passed 85 unit tests and 57 browser tests.',
    placeholder('Businesses signed up and live, and reminders sent, once there are real customers'),
    placeholder('Change in the no-show rate for a real business, measured before and after'),
  ],
  nextSteps: [
    'Sign up the first business: invite, form, WhatsApp setup with Meta, then switch it on.',
    'Get an approved WhatsApp template for the reminder, since buttons alone do not reach customers who have not ' +
      'written in the last 24 hours.',
    'Check at sign-up that the calendar was shared with permission to change events, not only to read them.',
    'Move n8n from the laptop to a small server once there is a paying client, as an approved cost.',
    'A second ready-made workflow on the same pattern, such as chasing overdue invoices or asking for reviews.',
  ],
};

export default caseStudy;
