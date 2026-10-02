// Case study of Sextant, written only from its public repository: README.md (status, what it is, the mode ladder, the
// checks and the layout), docs/PHASE-0-FINDINGS.md, docs/DATA-AVAILABILITY.md and docs/adr/0001 to 0004.
import type { CaseStudy } from './index';

const caseStudy: CaseStudy = {
  repo: 'sextant',
  slug: 'sextant',
  problem: [
    'Sextant is meant to answer one question: is there any family of crypto trading strategies with an edge robust ' +
      'enough to trade, across Binance and Kraken? Before any strategy is written, it has to be a system in which ' +
      'that question can be answered honestly.',
    'The expensive mistakes in this kind of research are architectural. Look-ahead bias, a dataset that silently ' +
      'drops the coins that died, a strategy that quietly depends on one exchange, or a language model that ends up ' +
      'setting position size can all make a losing idea look like a winner. Sextant is built so those mistakes are ' +
      'hard to make, and so far it places no orders at all.',
  ],
  constraints: [
    'Nothing places an order. The only network calls read public market data, no credential is used, and live mode ' +
      'cannot start.',
    'Binance and Kraken are independent adapters. No code branches on the name of a venue, and the two adapters ' +
      'cannot import each other.',
    'No strategy will ever be judged on gross returns: fees, spread, slippage and funding are modelled per venue.',
    'A language model may suggest a direction, a strategy, a confidence or a regime. It may never set size, ' +
      'leverage, exposure, stop distance or any risk budget.',
    'One developer with long gaps between changes, so only rules that tooling enforces are trusted to survive.',
  ],
  diagram: {
    title: 'How Sextant is layered',
    description:
      'The command line resolves a profile and runs preflight before wiring the engine. The engine sees only ports, ' +
      'the ports speak in pure domain types, and the venue adapters implement those ports against public market ' +
      'data, recording every request.',
    groups: [{ id: 'core', label: 'Core, free of any venue' }],
    nodes: [
      { id: 'cli', kind: 'client', label: 'Command line', detail: 'status, run and the data spike' },
      {
        id: 'app',
        kind: 'component',
        label: 'Configuration and preflight',
        detail: 'Defaults to backtest; live needs three gates',
      },
      {
        id: 'engine',
        kind: 'component',
        group: 'core',
        label: 'Engine',
        detail: 'Features, regime, strategies, risk, execution',
      },
      {
        id: 'ports',
        kind: 'component',
        group: 'core',
        label: 'Ports',
        detail: 'Exchange, bars, clock, cost model, language model',
      },
      {
        id: 'domain',
        kind: 'component',
        group: 'core',
        label: 'Domain',
        detail: 'Pure types that import nothing else',
      },
      {
        id: 'adapters',
        kind: 'component',
        label: 'Venue adapters',
        detail: 'Binance and Kraken, independent and read-only',
      },
      { id: 'venues', kind: 'external', label: 'Public market data', detail: 'Binance API and archive, Kraken API' },
      { id: 'journal', kind: 'store', label: 'Request journal', detail: 'Every call, with its status and size' },
    ],
    edges: [
      { from: 'cli', to: 'app', label: 'Chosen profile' },
      { from: 'app', to: 'engine', label: 'Wiring, after a passing preflight' },
      { from: 'engine', to: 'ports', label: 'Only through these interfaces' },
      { from: 'ports', to: 'domain', label: 'Typed values' },
      { from: 'adapters', to: 'ports', label: 'Implements' },
      { from: 'adapters', to: 'venues', label: 'Public requests, no credential' },
      { from: 'adapters', to: 'journal', label: 'Every request recorded' },
    ],
  },
  decisions: [
    {
      decision:
        'Enforce the boundary between the language model and risk in the response schemas: extra fields are ' +
        'rejected, and a field named after size, leverage, risk or similar breaks the build at import.',
      rejected: 'A rule in the documentation, marked as advisory and backed by code review.',
      reason:
        'The danger is drift, such as a notes field that starts carrying "suggest 3x". A written rule decays and ' +
        'fails silently; a value the schema cannot express cannot be smuggled through.',
    },
    {
      decision:
        'Python 3.12 with uv, in a ports and adapters layout whose layers are enforced in CI by import-linter, with ' +
        'strict mypy.',
      rejected: 'Another language with a stronger compiler.',
      reason:
        'The tools for market data, statistics, walk-forward evaluation and exchange access live in Python. The ' +
        'expensive mistakes here, such as look-ahead bias or a model that sets size, are architectural, and a ' +
        'compiler does not prevent them.',
    },
    {
      decision:
        'Model what each venue allows as the intersection of three layers: the venue, the account and the ' +
        'jurisdiction, with jurisdiction rules kept as configuration data.',
      rejected: 'Conditionals on the name of the venue wherever a feature differs.',
      reason:
        'Those conditionals spread into execution, data and backtests until adding a venue means auditing ' +
        'everything. Regulations change without any code change, so they belong in data.',
    },
    {
      decision:
        'Read public market data with httpx, quarantined inside the exchange adapters, and never return an empty ' +
        'result for a failed request.',
      rejected: 'ccxt, which puts every venue behind one normalised interface.',
      reason:
        'Normalising venues is the opposite of keeping venue-specific reasoning in its adapter. A silent empty ' +
        'result on a delisted coin is how a survivorship-biased dataset gets built without anyone noticing.',
    },
  ],
  results: [
    'The engineering foundation is in place: the layered package, the capability model, layered configuration, ' +
      'credentials handling, preflight, structured logging and CI. ruff, strict mypy, import-linter and pytest must ' +
      'all pass before a change is merged.',
    'Both venue adapters read health, instruments and bars from the real public endpoints, with a rate limiter ' +
      'per venue and every request recorded in a journal.',
    'A data-availability study answered the first research question by measurement. On Binance a point-in-time ' +
      'universe including delisted coins can be rebuilt back to August 2017; on Kraken it cannot be rebuilt from ' +
      'public data at all.',
    'It also showed why that matters: of the 238 in-scope Binance instruments listed on 1 January 2021, 119, exactly ' +
      'half, no longer trade. A backtest built from today\'s list would silently drop the half that died.',
    'The Binance collection made 1,393 calls with no credential, and every one returned 200.',
  ],
  nextSteps: [
    'Store bars in columnar files keyed by venue, symbol and timeframe, keeping the delisted coins.',
    'Then the backtester, tested against look-ahead bias by replacing every future bar with garbage and checking ' +
      'that no earlier decision changes, and against survivorship bias by running with and without delisted coins.',
    'Live trading stays blocked until every criterion in the written live gates is demonstrated and signed off.',
  ],
};

export default caseStudy;
