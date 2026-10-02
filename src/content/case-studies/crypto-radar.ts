// Case study of Crypto Radar, written from its public repository: README.md (how it works, boundaries, status,
// requirements, tests and design principles), ARCHITECTURE.md (the current flow), ROADMAP.md (phase status, the local
// model benchmark and what comes next), RISK.md (hard boundaries and the old cost preview), radar_v08/anomaly.py (why
// the anomaly scores are robust), radar_v08/notifications.py and radar_v08/ntfy.py (how alerts are delivered).
import type { CaseStudy } from './index';

const caseStudy: CaseStudy = {
  repo: 'crypto-radar',
  slug: 'crypto-radar',
  problem: [
    'Crypto Radar watches the public Kraken spot and perpetual markets so that a person does not have to. Fixed ' +
      'rules spot unusual activity, a local model gives a second opinion, and a human gets an alert when a market ' +
      'deserves a closer look.',
    'The hard part is trust. Market data can arrive stale, malformed or with a crossed order book, and a language ' +
      'model can state a claim the data does not support. So every input is checked before it is used, anything that ' +
      'cannot be verified is marked unknown instead of being treated as good, the rules decide, and the model only ' +
      'advises.',
    'It is research software for analysis only. It holds no exchange credentials, contains no order code and is ' +
      'not financial advice.',
  ],
  constraints: [
    'Public Kraken market data only: no exchange credentials, no private endpoints and not a line of order code.',
    'Everything runs on one Windows 11 PC with Python 3.12. Data is kept in SQLite on disk, and the model runs ' +
      'locally through Ollama.',
    'No paid API and no cloud inference, not even as a fallback when the local hardware is too small.',
    'The default model profile needs roughly 16 GB of graphics memory.',
    'The model can flag a market or abstain. It cannot size a position, set a stop or authorise anything.',
    'Fail closed: missing or stale evidence blocks the path instead of being guessed.',
    'The radar runs in a declared analysis-only mode. Public data comes in and alerts go out, nothing more.',
  ],
  diagram: {
    title: 'How Crypto Radar narrows the market down to an alert',
    description:
      'Public Kraken data passes through four fixed layers that narrow the whole market down to 8 names. Only then ' +
      'does a local model give an advisory verdict. Deterministic checks reject unsupported claims, and the events ' +
      'that pass are stored in SQLite and sent to a human as alerts.',
    groups: [{ id: 'layers', label: 'Fixed rules, no model' }],
    nodes: [
      {
        id: 'kraken',
        kind: 'external',
        label: 'Kraken public markets',
        detail: 'Spot and perpetual, public endpoints only',
      },
      { id: 'l0', kind: 'component', group: 'layers', label: 'L0 Universe', detail: 'All pairs, validated and snapshotted' },
      { id: 'l1', kind: 'component', group: 'layers', label: 'L1 Anomaly', detail: "Scores against each asset's own history" },
      { id: 'l2', kind: 'component', group: 'layers', label: 'L2 Structure', detail: 'Candles, ATR and setup detection' },
      { id: 'l3', kind: 'component', group: 'layers', label: 'L3 Micro', detail: 'Depth, trade tape, perpetual book' },
      {
        id: 'screener',
        kind: 'component',
        label: 'Local model screener',
        detail: 'Ollama on the PC, structured JSON only',
      },
      { id: 'checks', kind: 'component', label: 'Evidence checks', detail: 'Rejects claims the data does not support' },
      { id: 'store', kind: 'store', label: 'SQLite events and outbox', detail: 'Lifecycle and delivery records' },
      { id: 'alerts', kind: 'component', label: 'Alerts', detail: 'Windows notification, optional phone push' },
      { id: 'you', kind: 'client', label: 'You', detail: 'Decide what to look at' },
    ],
    edges: [
      { from: 'kraken', to: 'l0', label: 'Pairs, tickers, candles and books' },
      { from: 'l0', to: 'l1', label: 'Snapshot of every market' },
      { from: 'l1', to: 'l2', label: 'The 40 most unusual' },
      { from: 'l2', to: 'l3', label: 'The best 10 by structure' },
      { from: 'l3', to: 'screener', label: '8 finalists with compact evidence' },
      { from: 'screener', to: 'checks', label: 'Advisory verdict: flag or abstain' },
      { from: 'checks', to: 'store', label: 'Supported events only' },
      { from: 'store', to: 'alerts', label: 'Each event delivered at least once' },
      { from: 'alerts', to: 'you', label: 'Alert for a human' },
    ],
  },
  decisions: [
    {
      decision:
        'Let four layers of fixed rules narrow the whole market down to a handful of names, and only then ask the ' +
        'local model for a second opinion.',
      rejected: 'An autonomous, tool-using agent, or a model that steers the pipeline.',
      reason:
        'Rules decide and models advise. Fixed rules are repeatable and testable, there is no point paying a model ' +
        'to redo arithmetic, and the model output is treated as untrusted advice that can never size or authorise ' +
        'anything.',
    },
    {
      decision:
        "Score anomalies with the median and the median absolute deviation, against each asset's own history.",
      rejected: 'The mean and standard deviation, or raw percentage moves compared across assets.',
      reason:
        'With the mean, a handful of extreme past moves can hide the next one. And each asset has its own noise ' +
        'floor: 1% in five minutes is nothing for a memecoin and a lot for Bitcoin.',
    },
    {
      decision:
        'Keep all inference on the PC, with a hard local-only gate in front of the older cloud analysis path, ' +
        'proven by tests with fake clients.',
      rejected: 'A cloud model as a fallback when a local model is too slow or too large.',
      reason:
        'The project promises no paid APIs and no cloud inference, ever. A local model that misses its targets on ' +
        'this hardware counts as a failed candidate, not as a reason to enable the cloud.',
    },
    {
      decision: 'A cost that is not known leaves the net cost incomplete, and it is reported that way.',
      rejected: 'Counting a missing spread or slippage as zero, as an older cost preview did.',
      reason:
        'A partial cost total would look like a full net figure and overstate any edge. A missing quote, fee or ' +
        'depth stays unavailable instead of becoming zero.',
    },
  ],
  results: [
    '1,493 tests across 63 test files: 1,492 passing and 1 skipped, all offline, with no network and no model ' +
      'calls.',
    'About 29,600 lines of production code and 25,900 lines of test code.',
    'The analysis pipeline, the integrity layer, versioned evidence, cost scenarios and forward labels are built ' +
      'and covered by tests. The cost and outcome code is not yet wired into the running pipeline.',
    'A frozen benchmark of 100 development and 200 holdout cases has been run on the local models. Neither ' +
      'qwen3:14b nor llama3.2 passed the promotion gates, so no model is promoted and the default stays pinned.',
    'No real data has been calibrated yet, so the radar makes no claim about how often its alerts are right.',
  ],
  nextSteps: [
    'Wire the cost scenarios and the 15 minute, 1 hour, 4 hour and 24 hour outcome labels into the running ' +
      'pipeline, so alerts can be measured net of costs.',
    'Finish the independent human labels for the two benchmark categories that still lack them, so the 80 sealed ' +
      'holdout cases can be scored.',
    'Run a pre-registered experiment on whether more local model roles, such as an independent challenger, add ' +
      'value after costs and delay. If they do not, the simpler pipeline stays.',
    'Show real worker activity in the desktop control room, with clear queued, loading, working and stale states ' +
      'and a reduced motion mode.',
  ],
};

export default caseStudy;
