// Case study of Sextant, written from its public repository: README.md (status, results of SEXTANT-004 to SEXTANT-006
// F1, what it is, the mode ladder and the checks), docs/adr/0001-stack-and-layout.md, docs/adr/0003-llm-risk-boundary.md,
// docs/adr/0005-bar-storage-parquet-and-duckdb.md and docs/PRE-REGISTRATION-006-F2.md (the next family and its drift
// guard).
import type { CaseStudy } from './index';
import { placeholder } from '../portfolio';

const caseStudy: CaseStudy = {
  repo: 'sextant',
  slug: 'sextant',
  problem: [
    'Sextant asks one question: is there any family of crypto trading strategies with an edge robust enough to ' +
      'justify building the rest of the system? It is a research system across Binance and Kraken, and it places ' +
      'no real orders.',
    'Backtests are easy to fool. Look-ahead bias, survivorship bias, costs left out and variants tried until one ' +
      'looks good can all make a losing idea look like a winner. Sextant is built so those mistakes are hard to ' +
      'make: every study is written down before it runs, every cost is charged, and only out-of-sample results ' +
      'count.',
  ],
  constraints: [
    'Nothing places an order. The only network calls fetch public historical archives, no private endpoint is ' +
      'wired, and live mode cannot start.',
    'Every study is pre-registered: the hypothesis, the variant grid and the criteria are committed before anything ' +
      'they govern is computed. The runner refuses to start if the code has drifted from them.',
    'No strategy is ever judged on gross returns. Fees, spread, slippage, funding, FX and delisting are all charged, ' +
      'with every euro accounted in exact decimals.',
    'Walk-forward is the only mode, so no part of the system ever holds an in-sample result.',
    'Binance and Kraken are independent adapters, and no code branches on the name of a venue.',
    'A language model may suggest a direction, a strategy, a confidence or a regime. It may never set size, ' +
      'leverage, exposure, stop distance or any risk budget.',
    'One developer and a multi-day horizon on tens of instruments: nothing is latency-sensitive, so research speed ' +
      'and rules enforced by tooling matter more than raw speed.',
  ],
  diagram: {
    title: 'How Sextant tests a strategy family',
    description:
      'A study is pre-registered and its trials are counted before anything runs. Public archives from Binance and ' +
      'Kraken are stored as exact bars. The walk-forward engine charges every cost, and the statistics compare the ' +
      'result with a null baseline and the full trial count before a verdict is written.',
    groups: [{ id: 'engine', label: 'Walk-forward engine' }],
    nodes: [
      {
        id: 'prereg',
        kind: 'component',
        label: 'Pre-registration',
        detail: 'Hypothesis, variant grid and criteria, committed first',
      },
      { id: 'registry', kind: 'store', label: 'Trial registry', detail: 'Append-only and hash-chained' },
      {
        id: 'archives',
        kind: 'external',
        label: 'Public archives',
        detail: 'Binance and Kraken history, no private endpoint',
      },
      { id: 'bars', kind: 'store', label: 'Bar store', detail: 'Parquet files read with DuckDB, exact decimals' },
      {
        id: 'backtest',
        kind: 'component',
        group: 'engine',
        label: 'Backtest',
        detail: 'Point-in-time universe, out-of-sample only',
      },
      {
        id: 'costs',
        kind: 'component',
        group: 'engine',
        label: 'Cost model',
        detail: 'Fees, spread, slippage, funding, FX, delisting',
      },
      {
        id: 'stats',
        kind: 'component',
        group: 'engine',
        label: 'Statistics',
        detail: 'Matched null baseline, Deflated Sharpe Ratio',
      },
      { id: 'verdict', kind: 'component', label: 'Report and verdict', detail: 'Read against the registered criteria' },
    ],
    edges: [
      { from: 'prereg', to: 'registry', label: 'Every trial, charged before the engine runs' },
      { from: 'archives', to: 'bars', label: 'Ingested idempotently, with recorded checksums' },
      { from: 'bars', to: 'backtest', label: 'Bars as of each rebalance' },
      { from: 'prereg', to: 'backtest', label: 'Registered grid' },
      { from: 'backtest', to: 'costs', label: 'Every simulated trade' },
      { from: 'costs', to: 'stats', label: 'Net returns after every cost' },
      { from: 'registry', to: 'stats', label: 'Honest trial count' },
      { from: 'stats', to: 'verdict', label: 'Results against each criterion' },
    ],
  },
  decisions: [
    {
      decision:
        'Enforce the boundary between the language model and risk in the response schemas: extra fields are ' +
        'rejected, and a field named after size, leverage, risk or similar breaks the build at import.',
      rejected:
        'A rule in the documentation backed by code review, or letting the model propose a size that the risk code ' +
        'then caps.',
      reason:
        'A written rule decays and fails silently. A proposed size becomes an anchor that risk logic adjusts instead ' +
        'of ignoring, and it blurs the audit trail. A value that cannot be expressed cannot be smuggled through.',
    },
    {
      decision:
        'Python 3.12 with uv, in a ports and adapters layout whose layers are enforced by import-linter, with strict ' +
        'mypy.',
      rejected: '.NET (C#), for its compiler and first-class decimals.',
      reason:
        'The tools for walk-forward evaluation, the Deflated Sharpe Ratio and cost modelling live in Python. The ' +
        'expensive mistakes here, such as look-ahead bias or a model that sets size, are architectural, and a ' +
        'compiler does not prevent them.',
    },
    {
      decision:
        'Store bars as Parquet files, one per venue, symbol and timeframe, queried with DuckDB, with prices kept as ' +
        'strings.',
      rejected: 'SQLite, the closest call, or the JSON files an earlier spike used.',
      reason:
        'Bars are read as whole series across hundreds of files, a columnar scan that SQLite is worst at, and JSON ' +
        'took about 8 times the space. Strings round-trip exactly to decimals, so no value is truncated to a fixed ' +
        'precision.',
    },
  ],
  results: [
    'Momentum and trend following: 16 variants were committed before any data was downloaded, then run over 52 ' +
      'out-of-sample months of Binance spot history in EUR. Every one of the 80 variant-cells lost money in the ' +
      'backtest, the best 28.40% of the account and the worst 99.77%. Bitcoin bought and held at the same costs ' +
      'returned +86.31%.',
    'Every momentum variant lost money before a single fee was charged, so no cost assumption could rescue it. The ' +
      'Deflated Sharpe Ratio is 0.0000 at an honest trial count of 253, and the verdict was insufficient evidence.',
    'Cash-and-carry: 9 variants across 4 cost cells, all 36 trials charged before the engine ran, and every one ' +
      'lost money over 56 out-of-sample months, the best 5.74% and the worst 91.81%. The best-funded variant ' +
      'received 387.33 EUR of funding on 1,500 of equity, and its price legs gave most of it back.',
    'Two defects made the first cash-and-carry run void. Both are now regression tested, every registered ' +
      'parameter is perturbed by a test that checks the output moves, and the void rows still count in the trial ' +
      'registry.',
    'Ten held names gave only 2.3 effectively independent bets, because crypto names move together at a ' +
      'correlation of 0.36. And a 52-month out-of-sample window can only resolve an annualised Sharpe above about ' +
      '0.94.',
    placeholder('Results of the long-short cross-sectional family, once its pre-registered run is reported'),
  ],
  nextSteps: [
    'Run the long-short cross-sectional family on perpetuals under its pre-registration, which is already ' +
      'committed.',
    'Then test the remaining strategy families, one at a time, each pre-registered before it runs.',
    "Let each family's verdict decide whether building the rest of the system is justified.",
  ],
};

export default caseStudy;
