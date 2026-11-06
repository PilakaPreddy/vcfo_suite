import 'server-only';

import { ACTION_TIERS, type ActionTier } from '@/lib/actions/types';
import type { EmbeddingProviderName } from '@/lib/ask/embeddings/types';
import { ASK_PATHS, type AskPath } from '@/lib/ask/paths';

/**
 * Ask VCFO runtime configuration — env only, no model id hardcoded in logic
 * (defaults below are the documented fallbacks, ASK-VCFO-CONTEXT §10).
 */
type AskProviderName = 'anthropic' | 'bedrock';

export interface AskConfig {
  enabled: boolean;
  provider: AskProviderName;
  models: {
    guard: string;
    /** Answers that read live data through tools. */
    answer: string;
    contextualizer: string;
    /** Document answers: Haiku first, and an env override to Sonnet where evals need it. */
    document: string;
    /** Field extraction and choosing among catalog candidates in the data router. */
    extract: string;
    watch: string;
    agent: string;
  };
  /** Effort for the answer model; guard / contextualizer run without it. */
  answerEffort: 'low' | 'medium' | 'high';
  rateLimit: { hour: number; day: number };
  retrievalTopK: number;
  bedrockRegion: string | null;
  /** Server-side refusal fallback (Claude API only). */
  refusalFallback: boolean;
}

function intEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

/** Phase 9 proposed features (§9A), each off unless ASK_VCFO_FEATURE_<ID>=true. */
const ASK_FEATURE_IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'A1'] as const;
type AskFeatureId = (typeof ASK_FEATURE_IDS)[number];
export type AskFeatures = Record<AskFeatureId, boolean>;

export function askFeatures(): AskFeatures {
  return Object.fromEntries(
    ASK_FEATURE_IDS.map((id) => [id, process.env[`ASK_VCFO_FEATURE_${id}`] === 'true']),
  ) as AskFeatures;
}

export function askConfig(): AskConfig {
  const provider = process.env.ASK_VCFO_LLM_PROVIDER === 'bedrock' ? 'bedrock' : 'anthropic';
  const effort = process.env.ASK_VCFO_ANSWER_EFFORT;
  return {
    enabled: process.env.ASK_VCFO_ENABLED === 'true',
    provider,
    models: {
      guard: process.env.ASK_VCFO_MODEL_GUARD?.trim() || 'claude-haiku-5-5',
      answer: process.env.ASK_VCFO_MODEL_ANSWER?.trim() || 'claude-haiku-5-5',
      contextualizer: process.env.ASK_VCFO_MODEL_CONTEXTUALIZER?.trim() || 'claude-haiku-5-5',
      document: process.env.ASK_VCFO_MODEL_DOCUMENT?.trim() || 'claude-haiku-5-5',
      extract: process.env.ASK_VCFO_MODEL_EXTRACT?.trim() || 'claude-haiku-5-5',
      watch: process.env.ASK_VCFO_MODEL_WATCH?.trim() || 'claude-haiku-5-5',
      agent: process.env.ASK_VCFO_MODEL_AGENT?.trim() || 'claude-sonnet-5-5',
    },
    answerEffort: effort === 'medium' || effort === 'high' ? effort : 'low',
    rateLimit: { hour: intEnv('ASK_VCFO_RATE_LIMIT_HOUR', 30), day: intEnv('ASK_VCFO_RATE_LIMIT_DAY', 200) },
    retrievalTopK: intEnv('ASK_VCFO_RETRIEVAL_TOP_K', 4),
    bedrockRegion: process.env.ASK_VCFO_BEDROCK_REGION?.trim() || null,
    refusalFallback: process.env.ASK_VCFO_REFUSAL_FALLBACK !== 'false',
  };
}

function flagEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === 'on' || raw === '1';
}

function listEnv<T extends string>(name: string, allowed: readonly T[]): ReadonlySet<T> {
  const named = new Set((process.env[name] ?? '').split(',').map((part) => part.trim()));
  return new Set(allowed.filter((item) => named.has(item)));
}

export interface AskFlags {
  /** Portal checks. Default off in production until the site-terms check is done, on locally. */
  watch: boolean;
  /** Identity documents, extraction only and masked everywhere. Default off. */
  idDocReading: boolean;
  /** "Prepare filing run" for VCFO Assist. Default off until the written CS opinion exists. */
  assistHandoff: boolean;
  /** Scheduled runs, which only ever create proposals. Default off. */
  proactive: boolean;
  /** Kill switches: a named path or tier stops at once, with a clear message to the person. */
  killedPaths: ReadonlySet<AskPath>;
  killedTiers: ReadonlySet<ActionTier>;
}

export function askFlags(): AskFlags {
  return {
    watch: flagEnv('WATCH_ENABLED', process.env.NODE_ENV !== 'production'),
    idDocReading: flagEnv('ASK_ID_DOC_READING', false),
    assistHandoff: flagEnv('ASK_ASSIST_HANDOFF_ENABLED', false),
    proactive: flagEnv('ASK_PROACTIVE_ENABLED', false),
    killedPaths: listEnv('ASK_KILL_PATHS', ASK_PATHS),
    killedTiers: listEnv('ASK_KILL_TIERS', ACTION_TIERS),
  };
}

export interface AskBudgets {
  runMaxTurns: number;
  /** Input plus output tokens for one Do run; cache reads do not count. */
  runMaxTokens: number;
  /** Input plus output tokens for one chat answer across its tool rounds. */
  answerMaxTokens: number;
  /** Across all paths, per day (IST); reaching it stops model calls until the next day. */
  dailyTokens: number;
}

export function askBudgets(): AskBudgets {
  return {
    runMaxTurns: intEnv('ASK_RUN_MAX_TURNS', 12),
    runMaxTokens: intEnv('ASK_RUN_MAX_TOKENS', 200_000),
    answerMaxTokens: intEnv('ASK_ANSWER_MAX_TOKENS', 40_000),
    dailyTokens: intEnv('ASK_DAILY_TOKEN_BUDGET', 2_000_000),
  };
}

export interface AskEmbeddingsConfig {
  /** `none` unless Bedrock is asked for and has a region: search then runs on full-text alone. */
  provider: EmbeddingProviderName;
  region: string | null;
  model: string;
}

export function askEmbeddingsConfig(): AskEmbeddingsConfig {
  const region = process.env.ASK_EMBEDDINGS_REGION?.trim() || null;
  return {
    provider: process.env.ASK_EMBEDDINGS_PROVIDER === 'bedrock' && region ? 'bedrock' : 'none',
    region,
    model: process.env.ASK_EMBEDDINGS_MODEL?.trim() || 'amazon.titan-embed-text-v2:0',
  };
}
