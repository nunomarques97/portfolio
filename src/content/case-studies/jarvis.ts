// Case study of Jarvis, written from its public repository: README.md (how it works, confirmation, costs, memory,
// principles and hardware), docs/BRAIN.md (the conversation brain, its connection and default model), docs/MODELOS.md
// (voice and accent adaptation measurements) and docs/ROADMAP.md.
import type { CaseStudy } from './index';

const caseStudy: CaseStudy = {
  repo: 'jarvis',
  slug: 'jarvis',
  problem: [
    'Jarvis lets you talk to your coding work instead of typing it: ask how a project is doing, dictate a prompt ' +
      'for its Claude Code session, or start and stop a FORJA run, and hear the answer. It runs on a Windows PC, and ' +
      'listening, transcription and the voice stay on that PC.',
    'Voice is not authorisation. A misheard sentence must never send a prompt, and nothing the model writes or ' +
      'reads on a web page may count as your consent. An earlier version that sorted each sentence into one of about ' +
      '15 fixed intents also felt robotic: a misheard greeting came back as a project status, and a short follow-up ' +
      'was answered as an unrelated question.',
    "The current version hands the conversation to Claude, which keeps the context and uses Jarvis's functions as " +
      "tools, while Jarvis's own code decides what is allowed to happen.",
  ],
  constraints: [
    'Listening, transcription and the voice run locally, and no audio leaves the PC.',
    'No API key and no other paid service. The conversation uses the Claude subscription quota the user already ' +
      'has.',
    'Anything with an effect is read back first and runs only after a spoken "yes", checked by Jarvis\'s own code, ' +
      'never by the model.',
    'No buy or sell orders by voice, now or later. Money and trading requests are refused before they reach the ' +
      'model.',
    'A fixed ceiling on every exchange: at most 4 model calls, each with at most 32,000 tokens of context, and at ' +
      'most 2 web searches or page reads.',
    'The brain gets no shell, no access to project files and no credentials, and nothing is installed into other ' +
      'projects.',
    'Built and tested on one Windows 11 PC with a 16 GB graphics card.',
  ],
  diagram: {
    title: 'How Jarvis turns speech into an action',
    description:
      'Jarvis listens for the key or the wake word, transcribes on the PC and answers a few requests with local ' +
      'rules. Everything else goes to one warm Claude Code process, which can call only Jarvis tools. A tool with an ' +
      'effect only prepares a recap, and Jarvis acts after your spoken yes. Replies are spoken sentence by sentence.',
    groups: [
      { id: 'pc', label: 'On your PC' },
      { id: 'guard', label: 'Jarvis code' },
    ],
    nodes: [
      { id: 'you', kind: 'client', label: 'You', detail: 'Push-to-talk key or the wake word' },
      {
        id: 'ear',
        kind: 'component',
        group: 'pc',
        label: 'Listening',
        detail: 'openWakeWord, then voice activity detection',
      },
      {
        id: 'stt',
        kind: 'component',
        group: 'pc',
        label: 'Transcription',
        detail: 'Parakeet TDT 0.6B v3 on the CPU',
      },
      {
        id: 'rules',
        kind: 'component',
        group: 'pc',
        label: 'Local rules',
        detail: 'Be quiet, sleep, the time, yes or abort, money refusal',
      },
      {
        id: 'brain',
        kind: 'external',
        label: 'Conversation brain',
        detail: 'One warm Claude Code process, Haiku 4.5',
      },
      {
        id: 'tools',
        kind: 'component',
        group: 'guard',
        label: 'Jarvis tools',
        detail: 'Project status, reports, facts, notices',
      },
      {
        id: 'confirm',
        kind: 'component',
        group: 'guard',
        label: 'Recap and spoken yes',
        detail: 'Read back first, acts only on your yes',
      },
      {
        id: 'targets',
        kind: 'external',
        label: 'Projects',
        detail: 'Claude Code sessions and FORJA runs',
      },
      { id: 'voice', kind: 'component', label: 'Voice', detail: 'Kokoro, speaks each sentence as it is ready' },
    ],
    edges: [
      { from: 'you', to: 'ear', label: 'Speech, which never leaves the PC' },
      { from: 'ear', to: 'stt', label: 'Audio of one sentence' },
      { from: 'stt', to: 'rules', label: 'Transcript' },
      { from: 'rules', to: 'brain', label: 'Anything the rules do not answer' },
      { from: 'brain', to: 'tools', label: 'Tool calls' },
      { from: 'tools', to: 'confirm', label: 'A recap, for a tool with an effect' },
      { from: 'confirm', to: 'targets', label: 'Prompt or run command, after your yes' },
      { from: 'targets', to: 'voice', label: 'Outcome, said by Jarvis' },
      { from: 'brain', to: 'voice', label: 'Reply, sentence by sentence' },
      { from: 'voice', to: 'you', label: 'Spoken reply' },
    ],
  },
  decisions: [
    {
      decision:
        'Drive one persistent Claude Code CLI process over stream-json, signed in with the normal Claude ' +
        'subscription.',
      rejected: 'The Claude Agent SDK for Python, or the Messages API with an API key.',
      reason:
        'The API is paid per token, and the SDK is meant for API key authentication. The SDK also has a known ' +
        "hang on Windows. The CLI was already proven on the same PC by Jarvis's channel to Claude Code sessions, and " +
        'it needs no new package.',
    },
    {
      decision:
        'Tools that would change something only prepare a recap. Jarvis speaks it and acts only on a "yes" it heard ' +
        'from you.',
      rejected: 'Letting the model carry out an action, or count a "yes" that it wrote or read.',
      reason:
        'A "yes" written by Claude, found on a web page or inside a report confirms nothing. Voice never approves ' +
        'Claude Code tool permissions, and the brain can only use the tools Jarvis gives it.',
    },
    {
      decision:
        'Handle a few requests with fixed rules on the PC: be quiet, sleep and wake up, the time and date, the answer ' +
        'to a recap, and the refusal of money requests.',
      rejected: 'Sending every sentence to the model.',
      reason: 'These answers are fast and use no quota, and a money or trading request never reaches Claude at all.',
    },
    {
      decision: 'Use Claude Haiku 4.5 as the default brain, with no automatic switch to a larger model.',
      rejected: 'Claude Sonnet as the default, or switching to it when a question looks hard.',
      reason:
        'Haiku is the fastest and the lightest on the quota. Spoken replies are short, so the time to the first word ' +
        'matters more than extra depth, and a wrong switch trigger would cost latency on every exchange.',
    },
  ],
  results: [
    'The conversation brain, its tools, bounded memory and a queue of notices that never interrupts are built. The ' +
      'automatic tests drive them with a fake CLI and never start the real Claude Code, a microphone or sound.',
    'Transcription on 22 English test phrases in the author\'s voice, on the CPU: a word error rate of 24.8% at ' +
      '124 ms (p50). Phrase boosting lowered it to 21.8% and got more project names right, but no variant kept more ' +
      'requests intact, so accent adaptation stays off by default.',
    'The British voice is the only one that was faster to the first audio than the reference voice in every run: ' +
      '501 ms at p50 and 668 ms at p95 on 20 fixed sentences. That is still above the older 300 and 600 ms target.',
    'A typical exchange without a web search reads about 5,000 to 10,000 input tokens, most of them from the ' +
      'prompt cache, and writes 30 to 150.',
    'European Portuguese is not usable day to day yet: an earlier measurement on the author\'s voice gave a word ' +
      'error rate of 38 to 46%.',
  ],
  nextSteps: [
    'Measure the real brain on the PC, Haiku against Sonnet, before changing the default model.',
    'Record a training set in the author\'s voice, so that accent adaptation can be measured again.',
    'European Portuguese: first a transcription engine that beats the 38 to 46% error rate, then the Portuguese ' +
      'wake word, a European Portuguese voice and an interpreter that accepts either language.',
    'Make conversation feel more natural: fewer fixed phrases, fewer listening rules and shorter pauses, measured ' +
      'against targets in the author\'s own voice.',
  ],
};

export default caseStudy;
