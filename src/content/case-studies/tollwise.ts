// Case study of Tollwise, written from its public repository: README.md, ROADMAP.md, docs/routing.md,
// docs/compatibility.md, docs/privacy.md, docs/benchmarks.md, package.json and the module layout under src/.
import type { CaseStudy } from './index';
import { placeholder } from '../portfolio';

const caseStudy: CaseStudy = {
  repo: 'tollwise',
  slug: 'tollwise',
  problem: [
    'An app that calls the OpenAI or Anthropic API pays the price of the provider it is wired to, on every request. ' +
      'Another provider may serve the same model for less, but moving to it by hand means changing code, and a ' +
      'cheaper provider can lack something the request needs, such as tool calls, JSON mode or image input.',
    'Tollwise is a local proxy that makes that choice for each request. The app keeps the official SDK and changes ' +
      'only its base URL. Tollwise works out what the request needs, sends it to the cheapest, fastest or most ' +
      'balanced provider that has all of it, and reports what the request cost and what it saved.',
  ],
  constraints: [
    'A drop-in for the official openai and @anthropic-ai/sdk packages: the base URL is the only code change.',
    'It runs on your own machine with your own provider keys, with no account and no telemetry. It listens on ' +
      '127.0.0.1 and refuses to listen on a network address without an access key.',
    'Provider keys come only from environment variables. A key typed into the configuration file is rejected, and ' +
      'keys are redacted from every log line.',
    'It stores request metadata only: model, provider, routing trace, token counts, cost and latency. Prompts and ' +
      'answers are never stored.',
    'Node.js 24 or later, with three runtime dependencies: gpt-tokenizer, yaml and zod.',
    'Two endpoints are in scope, POST /v1/chat/completions and POST /v1/messages, streaming included. The other ' +
      'OpenAI and Anthropic endpoints answer 501.',
  ],
  diagram: {
    title: 'How Tollwise routes a request',
    description:
      'An app sends a chat request to Tollwise on the same machine. Tollwise checks what the request needs, picks ' +
      'a provider by price, speed or both, translates the request when that provider speaks the other API format, ' +
      'and returns the answer with its cost. Each routed request is recorded in a local SQLite file that feeds the ' +
      'dashboard.',
    groups: [
      { id: 'proxy', label: 'Tollwise proxy' },
      { id: 'history', label: 'Local history' },
    ],
    nodes: [
      { id: 'app', kind: 'client', label: 'Your app', detail: 'Official OpenAI or Anthropic SDK' },
      {
        id: 'server',
        kind: 'component',
        group: 'proxy',
        label: 'Local HTTP server',
        detail: 'Port 8484, request checks, optional access key',
      },
      {
        id: 'inspect',
        kind: 'component',
        group: 'proxy',
        label: 'Needs check',
        detail: 'Tools, JSON mode, vision, streaming, context length',
      },
      {
        id: 'select',
        kind: 'component',
        group: 'proxy',
        label: 'Provider choice',
        detail: 'Catalog prices and health, then the routing policy',
      },
      {
        id: 'translate',
        kind: 'component',
        group: 'proxy',
        label: 'Format translation',
        detail: 'Only when nothing the request uses is lost',
      },
      {
        id: 'providers',
        kind: 'external',
        label: 'Providers',
        detail: 'Anthropic, OpenAI, DeepSeek, OpenRouter, Ollama',
      },
      {
        id: 'store',
        kind: 'store',
        group: 'history',
        label: 'SQLite file',
        detail: 'Request metadata, never prompts or answers',
      },
      {
        id: 'dashboard',
        kind: 'component',
        group: 'history',
        label: 'Metrics API and dashboard',
        detail: 'Spend and savings, updated live',
      },
    ],
    edges: [
      { from: 'app', to: 'server', label: 'Chat request, only the base URL changed' },
      { from: 'server', to: 'inspect', label: 'Request body' },
      { from: 'inspect', to: 'select', label: 'Needs and token estimate' },
      { from: 'select', to: 'translate', label: 'Chosen provider and model' },
      { from: 'translate', to: 'providers', label: 'Request in the provider format' },
      { from: 'providers', to: 'app', label: 'Answer in the app format, with cost headers unless streamed' },
      { from: 'select', to: 'store', label: 'Routing record of every request' },
      { from: 'store', to: 'dashboard', label: 'Metrics' },
    ],
  },
  decisions: [
    {
      decision:
        'Switch only between providers of the model the app asked for, unless the user turns on an equivalence ' +
        'group of interchangeable models.',
      rejected: 'Serving a request with a cheaper, different model whenever Tollwise thinks it will do.',
      reason:
        'Substituted models do not give identical answers, and Tollwise measures no answer quality. Substitution is ' +
        'therefore opt-in, and every substituted answer says so in its headers.',
    },
    {
      decision:
        'Use a provider that speaks the other API format only when translating the request loses nothing it uses.',
      rejected: 'Sending a translated request that drops a feature the request relies on.',
      reason:
        'That would be a silent downgrade. The provider is left out of the candidates instead, and the client ' +
        'always gets back the format it called with.',
    },
    {
      decision:
        'Try the next provider only when a call fails before its response starts: no connection, a timeout, a rate ' +
        'limit or a server error.',
      rejected: 'Retrying every error, including refused credentials and rejected requests.',
      reason:
        'The caller has to fix a refused or rejected request, and another provider would very likely refuse it the ' +
        'same way.',
    },
    {
      decision: "Keep the request history in a local SQLite file, through Node's built-in node:sqlite module.",
      rejected: "A database server, like the one LiteLLM's proxy needs for its virtual keys.",
      reason:
        'Tollwise is one small process on your own machine. A file needs no server to run and adds no dependency.',
    },
  ],
  results: [
    'Modeled savings of 84.2% with the frontier and small-fast equivalence presets on, and 0.07% with the default ' +
      'configuration, on the same realistic workload with the cheapest policy at public list prices. These figures ' +
      'are modeled, not measured on real bills.',
    'Measured proxy overhead against a local stand-in provider with no latency, on 2026-09-19: 2 ms at p50 and 5 ms ' +
      'at p99 without streaming, 1.19 ms to the first streamed byte at p50, a startup of 408.06 ms (median of five ' +
      'runs) and 140.7 MB of idle memory.',
    'The official openai and @anthropic-ai/sdk packages, unmodified, passed all four end-to-end cases, streaming and ' +
      'not, against a local Ollama model. Tollwise has not been tested against the real OpenAI or Anthropic APIs.',
    'A static demo of the dashboard runs in the browser with sample data, with nothing to install.',
    'Tollwise is a pre-release that runs from source. There is no published package yet.',
    placeholder('Savings measured on a real bill, or usage by people other than the author, if there is any'),
  ],
  nextSteps: [
    'Support more of the OpenAI and Anthropic APIs, such as the Responses and embeddings endpoints, which answer 501 ' +
      'today.',
    'Add more providers to the catalog, and make adding one easier.',
    'An opt-in local log of prompts and answers, off by default and kept apart from the request metadata.',
    'A command to prune or cap the local request history.',
    'Simpler equivalence presets, so that opting a class of models into substitution takes less configuration.',
  ],
};

export default caseStudy;
