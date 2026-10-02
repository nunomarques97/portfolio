// Case study of Gearlift, written from its private repository: briefing_workout_app.md (concept, budget, platform,
// exercise data and backend choices), CLAUDE.md (stack, local storage, dataset size, languages), docs/accounts-foundation.md
// (sign-in, Firestore model, security rules, migration, account deletion), src/cloud/sync.ts and
// docs/audits/nun-150-151-sync-and-signin.md (two-way sync), src/engine/sessionCode.ts (workout sharing),
// src/storage/imageCache.ts and src/data/imageBaseUrl.ts (exercise photos), src/engine/prescription.ts,
// src/analytics/index.ts, src/config/features.ts, docs/audits/nun-147-logic-architecture-audit.md,
// docs/phase-2-personalization.md and app.json.
import type { CaseStudy } from './index';

const caseStudy: CaseStudy = {
  repo: 'gearlift',
  slug: 'gearlift',
  problem: [
    'Gearlift starts from what you have, not from a plan. You pick your equipment and what you want to train, and ' +
      'it builds a session from a public-domain library of 873 exercises, with sets, reps and rest for each one.',
    'It then takes you through the session one exercise at a time, with a rest countdown and audio cues, and logs ' +
      'every set. The history lives on the phone. Signing in with Google is optional and adds a copy in the cloud, ' +
      'so the history can follow you to a new phone.',
    'One developer built it with a target of about 25 USD to reach Google Play, the one-time Play Console fee. ' +
      'Every other part had to be free to run at this size.',
  ],
  constraints: [
    'Android first, on Google Play. iOS waits until the Android version proves itself.',
    'A target budget of about 25 USD to publish: no paid exercise data, no paid video and no custom domain.',
    'Exercise content must be free for commercial use. Exercise names and instructions stay in English, while the ' +
      'interface is translated into 9 languages.',
    'It has to work in a gym with poor signal, so history is stored on the phone first and exercise photos are ' +
      'cached on the device.',
    'No optional service may break a workout. Sign-in, sync and analytics all fail quietly and never block the ' +
      'session.',
    'Analytics sends counts and fixed labels only: no exercise names, no session ids and no text the user typed.',
    'An app that lets you create an account must let you delete it from inside the app, which Google Play requires.',
  ],
  diagram: {
    title: 'How Gearlift builds, runs and keeps a workout',
    description:
      'You choose equipment and goals, and the app builds a routine from the bundled exercise list, then guides you ' +
      'through it and stores every set on the phone. Exercise photos come from a CDN and are cached on the device. ' +
      'Once you sign in, a sync step merges the history with your Firebase account in both directions.',
    groups: [{ id: 'phone', label: 'On the phone' }],
    nodes: [
      { id: 'you', kind: 'client', label: 'You', detail: 'Equipment, muscles and preferences' },
      {
        id: 'builder',
        kind: 'component',
        group: 'phone',
        label: 'Workout builder',
        detail: 'Filters 873 bundled exercises, sets reps and rest',
      },
      {
        id: 'workout',
        kind: 'component',
        group: 'phone',
        label: 'Guided workout',
        detail: 'Timed sets, rest countdown, audio cues',
      },
      {
        id: 'storage',
        kind: 'store',
        group: 'phone',
        label: 'Local history',
        detail: 'AsyncStorage, the source of truth',
      },
      {
        id: 'sync',
        kind: 'component',
        group: 'phone',
        label: 'History sync',
        detail: 'Runs at sign-in and at app launch',
      },
      {
        id: 'firebase',
        kind: 'external',
        label: 'Firebase',
        detail: 'Google sign-in, Firestore, account deletion',
      },
      {
        id: 'photos',
        kind: 'external',
        label: 'Exercise photos',
        detail: 'jsDelivr CDN, cached on the phone',
      },
    ],
    edges: [
      { from: 'you', to: 'builder', label: 'What you have and want to train' },
      { from: 'builder', to: 'workout', label: 'Routine with sets, reps and rest' },
      { from: 'workout', to: 'storage', label: 'Every set and a resume point' },
      { from: 'storage', to: 'sync', label: 'History, once you sign in' },
      { from: 'sync', to: 'firebase', label: 'Union by session id, both ways' },
      { from: 'photos', to: 'workout', label: 'Photos, downloaded once' },
    ],
  },
  decisions: [
    {
      decision: 'Use free-exercise-db, a public-domain set of exercises with photos and written instructions.',
      rejected: 'Embedded YouTube videos, or a paid exercise API with video.',
      reason:
        "YouTube's terms do not allow it to be the core of an app, and access can be withdrawn at any time. The " +
        'paid API needs a key and a paid plan in production. The public-domain set is free for commercial use and ' +
        'fits the budget.',
    },
    {
      decision: 'Firebase, which starts on a free plan, for sign-in and the cloud copy of the history.',
      rejected: 'Supabase, the original plan.',
      reason:
        "Supabase's free tier allows only two active projects per account, and that account had no free slot left. " +
        "Firebase's limit is much higher, and the switch came before any Supabase code existed, so it cost nothing.",
    },
    {
      decision: 'Merge the phone and the account as a union by session id, keeping the local copy when both have it.',
      rejected: 'Letting the cloud copy win, or letting the phone win.',
      reason:
        'Both can erase real training history. Cloud wins drops workouts done offline or signed out, and phone wins ' +
        'drops workouts from another phone. A union cannot lose a workout: a duplicate is visible and fixable, a ' +
        'missing month is not.',
    },
    {
      decision: 'Share a workout as a bit-packed code shown as a QR code.',
      rejected: 'Compressed JSON in the QR code.',
      reason:
        'Both phones bundle the same exercise list, so the code only has to name each exercise by its index. A ' +
        'six-exercise session takes 42 characters instead of 168 with JSON and gzip, so the QR code is smaller and ' +
        'scans faster across a gym.',
    },
    {
      decision: 'Load exercise photos from a CDN, pinned to a fixed commit of a copy of the dataset that the project controls.',
      rejected: 'Bundling the images in the app, or pointing at the upstream repository.',
      reason:
        'Bundling 800 or more exercises at about two images each makes the download much larger, and every new ' +
        'image would need a new build. A fixed commit means the photos a release ships with cannot change under it.',
    },
  ],
  results: [
    'Published on Google Play. The repository is at version 1.0.7.',
    'A workout is built, run and logged entirely on the phone. Sign-in, the cloud copy and account deletion are ' +
      'optional extras.',
    'Two-way sync was checked on an emulator against the live Firebase project: sessions removed from the phone came ' +
      'back after sign-in, with their names, completion and per-set logs intact, and a session deleted in the app ' +
      'stayed deleted.',
    'The Firestore security rules are tested on the local emulator with 24 assertions that cover every read, write, ' +
      'list and delete across two users.',
    '408 Jest tests passed during the architecture audit in September 2026.',
  ],
  nextSteps: [
    'Shape sets, reps and session length from a user profile: goal, experience and activity level. The rules that ' +
      'set them are a pure function, so this can be added without changing anything that calls them.',
    'Decide how the app pays for itself. Ads and a paid Pro tier are built but switched off.',
    'Remember deleted sessions across phones, so that a delete made on one phone cannot be undone by another that ' +
      'was offline.',
    'An iOS version, only if the Android version proves itself.',
  ],
};

export default caseStudy;
