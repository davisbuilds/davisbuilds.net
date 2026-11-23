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
  source: { kind: 'repository' | 'fixtures'; repo: string; sha: string };
  runs: SyncedRun[];
};
