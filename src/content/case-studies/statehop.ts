// Case study of Statehop, written from its public repository: README.md, docs/PRODUCT.md (product loop, MVP, AI rule
// and action safety levels), docs/adr/001-packaging.md, DESIGN.md, and the code comments of the observation watchers,
// the observation service, the session builder, the app normaliser, the executable path policy, the retention policy
// and the storage schema.
import type { CaseStudy } from './index';
import { placeholder } from '../portfolio';

const caseStudy: CaseStudy = {
  repo: 'statehop',
  slug: 'statehop',
  problem: [
    'A power user moves between a few work contexts every day, such as Development or Gaming, and each one needs its ' +
      'own set of apps open. Saved groups of apps have to be set up by hand and never notice which context you are ' +
      'in, and time trackers only observe and draw charts.',
    'Statehop is a native Windows app that aims to close that loop on your own PC: observe how the PC is used, work ' +
      'out the context you are in, suggest how to prepare, restore or clean it up, learn from your answers, and act ' +
      'on its own only with safe actions you already approved.',
    'It is in development. The observation layer, the local storage and the rules that turn a day into sessions are ' +
      'built. Context inference, suggestions and actions are not built yet.',
  ],
  constraints: [
    'Windows 11 and .NET 10, as a native WinUI 3 app packaged as MSIX.',
    'Local-first: no cloud, no account and no telemetry by default.',
    'It never reads or stores a window title. It keeps the process identity and timestamps, and the folder of an ' +
      'executable only when it sits under a system install folder.',
    'It runs without administrator rights, so system and protected processes stay out of its reach.',
    'It runs all day, so it has to stay cheap: the foreground app comes from a Windows event hook, and the process ' +
      'list is read every 30 seconds.',
    'Nothing destructive happens without approval. Closing an app needs explicit permission, and force-closing is ' +
      'never automatic by default.',
    'AI comes only after the rule-based layers are solid, and then only to turn a request in plain words into a ' +
      'structured intent. Fixed rules always decide what happens.',
    'The interface must never feel like surveillance: no scores, goals, streaks or comparisons.',
  ],
  diagram: {
    title: 'How Statehop records a day',
    description:
      'Windows reports foreground changes, input and running processes to the watchers. The observation service ' +
      'records them in a local SQLite file, and the session builder turns one day of events into timeline blocks. ' +
      'The tray app shows the live activity today.',
    groups: [
      { id: 'observe', label: 'Observation layer' },
      { id: 'local', label: 'Only on this machine' },
    ],
    nodes: [
      { id: 'windows', kind: 'external', label: 'Windows', detail: 'Foreground, last input, processes' },
      {
        id: 'watchers',
        kind: 'component',
        group: 'observe',
        label: 'Watchers',
        detail: 'Event hook, idle check, 30 s process poll',
      },
      {
        id: 'service',
        kind: 'component',
        group: 'observe',
        label: 'Observation service',
        detail: 'Records what happened, infers nothing yet',
      },
      {
        id: 'store',
        kind: 'store',
        group: 'local',
        label: 'SQLite file',
        detail: 'Process identity and times, no titles',
      },
      {
        id: 'sessions',
        kind: 'component',
        group: 'local',
        label: 'Session builder',
        detail: 'Turns a day into blocks, not on screen yet',
      },
      { id: 'app', kind: 'component', label: 'Tray app', detail: 'Live activity feed and diagnostics' },
      { id: 'you', kind: 'client', label: 'You', detail: 'Tray icon or global hotkey' },
    ],
    edges: [
      { from: 'windows', to: 'watchers', label: 'Changes as they happen' },
      { from: 'watchers', to: 'service', label: 'Foreground, idle and process events' },
      { from: 'service', to: 'store', label: 'Events, with paths narrowed' },
      { from: 'store', to: 'sessions', label: 'One day of events' },
      { from: 'service', to: 'app', label: 'Activity feed' },
      { from: 'app', to: 'you', label: 'Window opened on demand' },
    ],
  },
  decisions: [
    {
      decision: 'Package the app as MSIX from the start.',
      rejected: 'A plain unpackaged executable.',
      reason:
        'The Microsoft Store is the only free route to a signed app with no SmartScreen warning, and it needs MSIX. ' +
        'A side-by-side test found no difference between the two for reading processes, the foreground window, idle ' +
        'time and global hotkeys. The only cost is starting with Windows through a startup task instead of the ' +
        'registry.',
    },
    {
      decision: 'Store the process identity and timestamps only, with no column for window titles.',
      rejected: 'Recording the window title next to each foreground change.',
      reason: 'Titles can carry client names, file names, web addresses and email subjects.',
    },
    {
      decision:
        'Keep the full path of an executable only under a system install folder, and only the file name for ' +
        'everything else.',
      rejected: 'A denylist of sensitive folders.',
      reason:
        'Folder names leak project names and folder structure. A denylist would have to guess what is sensitive, ' +
        'and would be wrong on the first folder nobody thought of.',
    },
    {
      decision:
        'Hear about foreground changes from a Windows event hook, and read the process list on a coarse 30-second ' +
        'poll.',
      rejected: 'Polling the foreground window, or tracing process starts through ETW or WMI.',
      reason:
        'The hook fires only when the foreground really changes, which keeps the cost of a full day near zero. ETW ' +
        'and WMI cost more than they are worth here: the product needs to know that Docker ran this afternoon, not ' +
        'the second it started.',
    },
  ],
  results: [
    'In development. The tray app observes the foreground app, idle time and process starts and stops into SQLite, ' +
      'with a global hotkey, start with Windows and local notifications. Its window shows the live activity and ' +
      'diagnostics.',
    'A full day of real use, recorded on 6 Sep 2026, gave 1,862 foreground events over 29 process names. It shaped ' +
      'the rules that count the lock screen as absence and fold focus switches under a minute into the block where ' +
      'they happened.',
    'Measured database growth is about 18 MB a month at 8 hours a day, and about 73 MB with the machine on all day. ' +
      'Raw events are kept for 90 days, then rolled up into daily totals.',
    'The session builder that turns a day into timeline blocks is built and tested, and the Day Strip design for the ' +
      'timeline was chosen from three HTML mocks, in light and dark.',
    placeholder('CPU and memory use of the running app over a full working day, once measured'),
  ],
  nextSteps: [
    'Show the day as the Day Strip in the running app, checked in light, dark and high contrast, with keyboard ' +
      'access to every block.',
    'Find contexts automatically from the apps you use together, using weeks of real observation.',
    'Manual workspaces, and cleanup suggestions worded as likelihoods, such as "Docker appears unlikely to be needed ' +
      'in your current context".',
    'Remember preferences such as never suggest, never close and always keep.',
    'Measure in real use how many apps run with higher rights, which Statehop could not close.',
  ],
};

export default caseStudy;
