/**
 * lib/ai/prompts/types.ts — what every prompt template returns.
 *
 * The split is not cosmetic. `system` is constant for a given version and is
 * the half marked cacheable on providers that support it; `user` is the half
 * that changes per run. Moving a variable into the system half quietly
 * disables caching and costs money on every call after the first.
 */
export interface BuiltPrompt {
  /** e.g. 'site_copy.v1'. Written to ai_jobs.prompt_version on every run. */
  version: string;
  system: string;
  user: string;
}
