// The shape of src/generated/oneshots/runs.json, written by the sync step and
// read by the pages.

export type Lab = 'anthropic' | 'openai' | 'other';

export type SyncedAsset = { file: string; description: string; url: string | null };

export type SyncedRun = {
  slug: string;
  title: string;
  summary: string;
  date: string;
  kind: 'long-horizon' | 'single-file';
  medium: string[];
  curatorNote: string;
  agent: { model: string; modelId: string | null; harness: string; reasoning: string | null };
  lab: Lab;
  humanTurns: number | null;
  wallClockMinutes: number | null;
  // The brief up to the oneshots `<!-- after delivery -->` line;
  // briefAfterDelivery says messages after it were left out.
  brief: string | null;
  briefAfterDelivery: boolean;
  hero: string | null;
  previews: { file: string; caption: string }[];
  links: { tree: string; brief: string | null; log: string | null };
  demo: { src: string; substitutions: { file: string; label: string }[] } | null;
  assets: SyncedAsset[];
  release: { tag: string; url: string | null };
};

export type SyncedData = {
  // Fixtures use a placeholder repo and SHA so link-building runs in tests.
  source: { kind: 'repository' | 'fixtures'; repo: string; sha: string };
  runs: SyncedRun[];
};
