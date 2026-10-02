// Case study of FORJA, written from its public repository: README.md (what it is, how it works, evidence, design
// decisions, quick start and status) and docs/CORE.md (the execution contract every session works under).
import type { CaseStudy } from './index';
import { placeholder } from '../portfolio';

const caseStudy: CaseStudy = {
  repo: 'forja',
  slug: 'forja',
  problem: [
    'Coding agents are good at producing plausible changes and bad at knowing when they are actually done. When the ' +
      'agent that writes the code also decides that the task is finished, nothing outside it checks that claim.',
    'FORJA is a small command-line controller that runs Claude Code or Codex against an existing Git project and ' +
      'keeps those two jobs apart. The agent writes the code, in a fresh session for each phase. The controller owns ' +
      'the task state, runs the checks itself, sends the result to a separate reviewer and enforces the budgets. A ' +
      "worker's \"done\" is a handoff, not a verdict.",
  ],
  constraints: [
    'Node.js 24 with zero runtime dependencies, and no agent framework or background service.',
    'It works on an existing Git project, from a clean working tree unless the user allows otherwise, and needs an ' +
      'installed, logged-in Claude Code or Codex CLI. It never switches providers on its own and never silently ' +
      'falls back to a paid route.',
    'Every loop has a hard limit. The defaults are 30 sessions, 2 implementation attempts per task, 30 minutes per ' +
      'call, 2 context rotations and a context limit of 120,000 tokens.',
    'Checks run without a shell, and a check that changes the source fails. They can also run in a bubblewrap ' +
      'sandbox with read-only source and no network.',
    'Only one controller writes to a project at a time, and workers never commit or push.',
    'A choice with a paid or unknown cost stops the run until a person decides. Retries, resume and time passing ' +
      'never count as that decision.',
    'It is developed on Windows, and some supervision helpers only work there.',
  ],
  diagram: {
    title: 'How FORJA takes a task to done',
    description:
      'The scheduler hands the goal to a plan session, then each task to a develop session. When the developer ' +
      'hands over, the controller runs the checks itself and a separate, read-only session reviews the work. A ' +
      'failed check or a rejection goes back to development within the budget. Every step is recorded on disk.',
    groups: [
      { id: 'controller', label: 'Controller' },
      { id: 'agents', label: 'Agent sessions' },
    ],
    nodes: [
      { id: 'goal', kind: 'client', label: 'Goal', detail: 'Acceptance criteria, from the command line' },
      {
        id: 'scheduler',
        kind: 'component',
        group: 'controller',
        label: 'Scheduler',
        detail: 'Task state, hard budgets, one-writer lock',
      },
      {
        id: 'plan',
        kind: 'external',
        group: 'agents',
        label: 'Plan session',
        detail: 'Claude Code or Codex, fresh context',
      },
      {
        id: 'develop',
        kind: 'external',
        group: 'agents',
        label: 'Develop session',
        detail: 'One task with its tests, never marks it done',
      },
      { id: 'checks', kind: 'component', label: 'Check runner', detail: 'Run by the controller, with no shell' },
      { id: 'review', kind: 'external', label: 'Review session', detail: 'Separate and read-only' },
      { id: 'deliver', kind: 'component', label: 'Delivery, opt-in', detail: 'Commit or push by the controller' },
      { id: 'state', kind: 'store', label: 'Run state on disk', detail: 'State, check logs, usage ledger' },
    ],
    edges: [
      { from: 'goal', to: 'scheduler', label: 'Goal and criteria' },
      { from: 'scheduler', to: 'plan', label: 'Goal and a bounded project map' },
      { from: 'plan', to: 'develop', label: 'Tasks with files, criteria and checks' },
      { from: 'develop', to: 'checks', label: 'Handoff: ready for validation' },
      { from: 'checks', to: 'review', label: 'Passed checks and their logs' },
      { from: 'review', to: 'deliver', label: 'Approval of the exact snapshot' },
      { from: 'checks', to: 'develop', label: 'Failed check, within budget' },
      { from: 'review', to: 'develop', label: 'Rejection with findings, within budget' },
      { from: 'scheduler', to: 'state', label: 'Every step, for recovery after a crash' },
    ],
  },
  decisions: [
    {
      decision: 'Send every task to an independent reviewer, even when all its checks pass.',
      rejected: 'Accepting a task as soon as its checks pass.',
      reason:
        'Checks prove only what they test, and a worker writes many of its own tests. A separate read-only session ' +
        'that reads the criteria and the source catches missing requirements that no test asks about. The reviewer ' +
        'costs tokens, so its model tier is configurable, but review is never optional.',
    },
    {
      decision: 'The controller runs the checks, and a worker can only report that it is ready for validation.',
      rejected: "Trusting the agent's own report that its checks passed.",
      reason:
        'A failed required check cannot be waved through by a review, and acceptance files owned by the caller are ' +
        'pinned by hash so that an agent cannot weaken the test it is graded by.',
    },
    {
      decision:
        'Start each phase in a fresh session that reads the task, criteria, decisions and a bounded project map. At ' +
        'a context limit, the developer writes a checkpoint and a new session continues from it.',
      rejected: 'Rebuilding the context of a run from its conversation history.',
      reason: 'The context size stays predictable, and a run can recover after a crash from the state on disk.',
    },
    {
      decision: 'Keep a small runtime with no dependencies, no agent framework and no background service.',
      rejected: 'Building on one of the larger orchestration and memory platforms, which were studied.',
      reason:
        'A component is adopted only when a controlled test shows better quality for the total cost, not because ' +
        'it has more features.',
    },
  ],
  results: [
    'Version 0.20.0, measured on 29 September 2026: 1,173 automated tests in 66 files, with 1,167 passed, 0 failed ' +
      'and 6 skipped, and no runtime dependencies.',
    '35 tagged releases, from v0.1.0 to v0.20.0.',
    'In a small pilot on the real controller, an implementation met 12 of 12 external criteria and passed its 6 ' +
      'worker tests, and the separate reviewer still rejected it: its asynchronous tests had no timeout guard, ' +
      'which the task required. The run was recorded as a failed delivery, not repaired into a success.',
    'A candidate test-writing mode caught 23 of 24 faulty variants, the same as the existing mode, but took 24.1% ' +
      'longer. It was not adopted.',
    'These are small experiments, and they do not show that FORJA can deliver every complex product on its own.',
    placeholder('Projects or people using FORJA other than its author, if there are any'),
  ],
  nextSteps: [
    'Assign specialists to tasks while a run is in progress. This is proposed and not built yet.',
    'Let several writers work in one project at the same time. This is proposed and not built yet.',
    'Replan a run while it is in progress. This is proposed and not built yet.',
    placeholder('Which of these comes first, and when'),
  ],
};

export default caseStudy;
