// Case study of Velora Poker, written from its public repository: README.md (features, how it works, engineering
// notes, optional features, limitations and contributing), the feature notes in src-tauri/Cargo.toml, the module notes
// of src-tauri/src/import/validate.rs, watcher/mod.rs, table_track/mod.rs and overlay/manager.rs, and the message of
// its latest commit (the multi-table HUD).
import type { CaseStudy } from './index';
import { placeholder } from '../portfolio';

const caseStudy: CaseStudy = {
  repo: 'velora-poker',
  slug: 'velora-poker',
  problem: [
    'A poker HUD puts statistics about each opponent on top of the table while you play. Velora does that for ' +
      'PokerStars on Windows, entirely on your own machine: no accounts, no cloud, no telemetry and no network calls.',
    'The hard part is the overlay. It has to find every open table, sit on the right seats, follow the window when it ' +
      'moves, and never block the Fold, Call and Raise buttons. It also has to stay within the PokerStars rules for ' +
      'HUDs.',
  ],
  constraints: [
    'Windows 10 or 11 only: table tracking and click-through use Win32 APIs.',
    'PokerStars is the only supported room, and only English hand histories are parsed.',
    'Everything stays local. Hands are stored in a SQLite file under the user profile.',
    'The PokerStars HUD rules allow statistics and manual player colours, but not automatic player labels. ' +
      'Strategic advice during play carries even more risk.',
    'The overlay must let clicks through to the table everywhere except its own controls.',
    'A per-user installer that needs no administrator rights. It is not code-signed, so SmartScreen warns on the ' +
      'first run.',
  ],
  diagram: {
    title: 'How Velora turns hand histories into a HUD',
    description:
      'PokerStars writes hand histories to a folder. A watcher picks up each new hand, the parser reads it and the ' +
      'import stores it once in SQLite, where the stats are computed. A table tracker follows every table window, and ' +
      'each table gets its own transparent overlay with the stats of its players.',
    groups: [{ id: 'backend', label: 'Rust backend (Tauri 2)' }],
    nodes: [
      { id: 'client', kind: 'external', label: 'PokerStars client', detail: 'English hand histories, table windows' },
      { id: 'folder', kind: 'store', label: 'Hand-history folder', detail: 'Text files on disk' },
      {
        id: 'watcher',
        kind: 'component',
        group: 'backend',
        label: 'Folder watcher',
        detail: 'New and changed .txt files',
      },
      {
        id: 'parser',
        kind: 'component',
        group: 'backend',
        label: 'Parser',
        detail: 'Seats, positions, actions, showdowns',
      },
      {
        id: 'import',
        kind: 'component',
        group: 'backend',
        label: 'Import and integrity checks',
        detail: 'One transaction, duplicates skipped',
      },
      {
        id: 'db',
        kind: 'store',
        group: 'backend',
        label: 'SQLite database',
        detail: 'Hands, notes, colours and HUD layouts',
      },
      {
        id: 'stats',
        kind: 'component',
        group: 'backend',
        label: 'Stats and sessions',
        detail: '18 stats per opponent, with sample sizes',
      },
      {
        id: 'tracker',
        kind: 'component',
        group: 'backend',
        label: 'Table tracker',
        detail: 'Finds table windows, follows their moves',
      },
      {
        id: 'overlay',
        kind: 'client',
        label: 'Overlay per table',
        detail: 'Transparent React webview, click-through',
      },
    ],
    edges: [
      { from: 'client', to: 'folder', label: 'Hands as they are played' },
      { from: 'folder', to: 'watcher', label: 'File changes' },
      { from: 'watcher', to: 'parser', label: 'New hand text' },
      { from: 'parser', to: 'import', label: 'Parsed hands' },
      { from: 'import', to: 'db', label: 'Valid hands only' },
      { from: 'db', to: 'stats', label: 'Hands of each player' },
      { from: 'client', to: 'tracker', label: 'Table windows' },
      { from: 'tracker', to: 'overlay', label: 'Table position and size' },
      { from: 'stats', to: 'overlay', label: 'Stats of the seated players' },
    ],
  },
  decisions: [
    {
      decision: "Build every overlay window on the overlay manager's own thread.",
      rejected: 'Creating the window from inside a command handler.',
      reason:
        'On Windows that can deadlock: the second webview never finished starting and never painted. The Tauri ' +
        'documentation names a separate thread as one of the safe places to create windows.',
    },
    {
      decision: 'Keep a pool of overlay windows. A closed table returns its window, hidden, for the next table.',
      rejected: 'Creating a window when a table opens and destroying it when the table closes.',
      reason:
        'Creating and destroying webviews quickly, as tables open and close, can freeze the event loop. A reused ' +
        'window only loads its new page.',
    },
    {
      decision:
        'A light thread reads the cursor about 60 times a second and switches click-through on or off only when ' +
        'the cursor moves on or off a HUD control.',
      rejected: 'Answering the Windows hit test for the overlay window.',
      reason:
        'The WebView2 content lives in a child window of another process, which answers the hit test first, so ' +
        'that approach does not work here.',
    },
    {
      decision:
        'Put automatic player labels and strategic advice behind build options that are off by default.',
      rejected: 'Shipping them in the default build.',
      reason:
        'The PokerStars HUD rules do not allow automatic player labels, and advice during play carries more risk. ' +
        'Using them for real-money play could put the account at risk, so the default build leaves them out.',
    },
  ],
  results: [
    'Live import of cash, tournament and Zoom hand histories. Imports are transactional and duplicate-safe, so ' +
      'reading a file again never counts a hand twice.',
    '18 statistics per opponent, each shown with its sample size. No player gets a label before 25 hands, the ' +
      'default.',
    'One overlay per open table, for tables of 2 to 10 players. HUD positions are saved per seat and table size, so ' +
      'one drag sets every table of that size.',
    'The integrity checks ran against a corpus of 275 real hands from 22 files and reject none of them, and a test ' +
      'keeps it that way. Hands that fail to parse are counted and explained in the app, never dropped silently.',
    'Rust tests run against sample hand-history files, and the code is under the MIT licence.',
    placeholder('Import speed on large hand histories and overlay cost with many tables open, once measured'),
  ],
  nextSteps: [
    'Parsers for other poker rooms and other hand-history languages.',
    'New statistics, built on the opportunity counts the stats engine already keeps.',
    'Measure performance on large imports and with many tables open at once.',
    'Accessibility: colour contrast and keyboard focus styles.',
  ],
};

export default caseStudy;
