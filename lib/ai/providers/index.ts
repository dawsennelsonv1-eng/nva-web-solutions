import 'server-only';
import { PROVIDER_IDS, type ProviderId } from '../types';
import { anthropicProvider } from './anthropic';
import { compatibleProvider } from './compatible';
import { moonshotProvider } from './moonshot';
import { openrouterProvider } from './openrouter';
import { openaiProvider } from './openai';
import type { AiProvider } from './base';

/**
 * lib/ai/providers/index.ts — the only place a ProviderId becomes an object.
 *
 * Adapters are module-level singletons and hold NO state: keys are read from
 * env at call time, never captured at construction. That matters on Vercel,
 * where a warm lambda can outlive an environment variable change; capturing
 * the key once would keep using a rotated secret until the instance recycled.
 */

const REGISTRY: Record<ProviderId, AiProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  moonshot: moonshotProvider,
  openrouter: openrouterProvider,
  compatible: compatibleProvider,
};

export function getProvider(id: ProviderId): AiProvider {
  return REGISTRY[id];
}

export function listProviders(): AiProvider[] {
  return PROVIDER_IDS.map((id) => REGISTRY[id]);
}

/** For the admin panel's status strip: which vendors actually have keys. */
export function providerStatus(): Array<{
  id: ProviderId;
  label: string;
  configured: boolean;
  requires: string;
}> {
  return listProviders().map((p) => ({
    id: p.id,
    label: p.label,
    configured: p.isConfigured(),
    requires: p.configHint(),
  }));
}

export type { AiProvider } from './base';
