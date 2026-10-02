// Case study of SeekAI, written from its public repository: README.md (run, local AI, build and test, storage and
// behaviour, V1 limits), TESTING.md (the verification of 2026-09-19), src/SeekAI.Core/Ollama.cs and
// src/SeekAI.Core/SearchIndex.cs.
import type { CaseStudy } from './index';
import { placeholder } from '../portfolio';

const caseStudy: CaseStudy = {
  repo: 'seekai',
  slug: 'seekai',
  problem: [
    'Finding a file often starts from a half-remembered name, a phrase from inside it, or only the idea it was ' +
      'about. SeekAI is a small Windows tray launcher that covers all three: press Ctrl + Space from any app, type, ' +
      'and open the result with Enter.',
    'Search by meaning needs embeddings of the text. SeekAI makes them with a local Ollama model, so the text of your ' +
      'files stays on your machine. There is no cloud AI, account, analytics or telemetry.',
  ],
  constraints: [
    'A native WPF app on .NET 10 for Windows x64. The portable build includes .NET and needs no installer or ' +
      'administrator rights.',
    'It indexes only the folders you add in Settings, never scans drives on its own, and never modifies your files.',
    'Embedding requests go only to Ollama on 127.0.0.1, port 11434, bypassing HTTP proxies. A normal search calls ' +
      'no generative model.',
    'It reads text and code files and text-based PDFs. It skips build and dependency folders, linked folders, ' +
      'binary-looking files, and files over 5 MB or 250,000 extracted characters.',
    'Meant for modest personal collections, not millions of files: semantic search compares the stored vectors on ' +
      'the machine.',
    'The index keeps the extracted text in plain text under your Windows profile, and removing a folder is not a ' +
      'secure erase.',
  ],
  diagram: {
    title: 'How SeekAI indexes and searches your files',
    description:
      'The indexer reads changed files from the folders you chose, splits their text into chunks and asks a local ' +
      'Ollama model for embeddings, then stores everything in one SQLite file. A search from the launcher combines ' +
      'filename, full-text and meaning matches from that file.',
    groups: [{ id: 'app', label: 'SeekAI on your PC' }],
    nodes: [
      { id: 'folders', kind: 'store', label: 'Folders you chose', detail: 'Text, code and text-based PDFs' },
      {
        id: 'indexer',
        kind: 'component',
        group: 'app',
        label: 'Indexer',
        detail: 'Reads only files with a new time or size',
      },
      {
        id: 'index',
        kind: 'store',
        group: 'app',
        label: 'SQLite index',
        detail: 'Names, text chunks, FTS5 entries, vectors',
      },
      {
        id: 'search',
        kind: 'component',
        group: 'app',
        label: 'Search',
        detail: 'Name, text and meaning scores combined',
      },
      {
        id: 'launcher',
        kind: 'client',
        group: 'app',
        label: 'Launcher',
        detail: 'Ctrl + Space, arrows, Enter opens the file',
      },
      {
        id: 'ollama',
        kind: 'external',
        label: 'Ollama',
        detail: 'nomic-embed-text on 127.0.0.1 only',
      },
    ],
    edges: [
      { from: 'folders', to: 'indexer', label: 'Changed files' },
      { from: 'indexer', to: 'index', label: 'Chunks of 1,600 characters' },
      { from: 'index', to: 'search', label: 'Text matches and stored vectors' },
      { from: 'search', to: 'launcher', label: 'Results with snippets' },
      { from: 'launcher', to: 'search', label: 'Query' },
      { from: 'indexer', to: 'ollama', label: 'Chunks to embed' },
      { from: 'search', to: 'ollama', label: 'Query to embed' },
    ],
  },
  decisions: [
    {
      decision:
        'Make every embedding with a local Ollama model, nomic-embed-text, and send requests only to 127.0.0.1.',
      rejected: 'A cloud AI service for embeddings.',
      reason:
        'The text of your files never leaves the machine. Only the one-time model download needs the internet, and ' +
        'it carries no file data.',
    },
    {
      decision:
        'Keep filename and full-text search working on their own, and add results by meaning when the model is ' +
        'ready.',
      rejected: 'Making search depend on Ollama being up.',
      reason:
        'Without Ollama or the model, filename and text search carry on, and Reindex fills the missing embeddings ' +
        'when it returns. Text results also stay usable while a cold model loads.',
    },
    {
      decision:
        'Scan incrementally by modification time and size, and replace the text and embeddings of a changed file ' +
        'in one step.',
      rejected: 'Reading and embedding every file again on each scan.',
      reason:
        'Unchanged files are not read or embedded again, so a restart is cheap, and an interrupted embedding run ' +
        'resumes on the next scan.',
    },
  ],
  results: [
    'Version 1 ships as a portable Windows x64 build and a ZIP. It was verified on Windows on 2026-09-19.',
    '22 live checks passed with real local embeddings. They cover filename and text search, paraphrases, ' +
      'incremental changes, restarts, the offline fallback, embedding backfill, exclusions, deletion, folder ' +
      'removal, chunking, PDF text and settings.',
    'On the demo files, two paraphrases about session context ranked the right notes first by meaning, and an ' +
      'unrelated cooking paraphrase ranked the dinner file first.',
    'A restart scan with real embeddings found 4 unchanged files and embedded 0 new chunks.',
    'Checked by hand on the desktop: Ctrl + Space from another app opens the launcher with the search field focused, ' +
      'Enter opens the file in its default app, and Esc hides the launcher.',
    placeholder('Search speed and index size on a real personal collection, once measured'),
  ],
  nextSteps: [
    placeholder('A next step for SeekAI, for example a file watcher, since V1 needs Reindex or a restart after edits'),
    placeholder('A next step for SeekAI, for example OCR, since V1 skips scanned PDFs'),
    placeholder('A next step for SeekAI, for example an installer, updates and start with Windows, which V1 lacks'),
  ],
};

export default caseStudy;
