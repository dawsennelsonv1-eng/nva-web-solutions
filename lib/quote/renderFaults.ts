/**
 * lib/quote/renderFaults.ts — what went wrong, in words, with what to do.
 *
 * ============================================================================
 * WHY A TABLE AND NOT A STRING
 * ============================================================================
 *
 * Phase 18 made the render report its own exception instead of blaming the
 * network. That was progress and it stopped short: "TypeError: Failed to
 * fetch" is the truth and it is not an ANSWER. It does not say whether the
 * request left the phone, whether the server refused it, or whether anybody
 * should press the button again.
 *
 * This maps every failure this path can produce onto three things:
 *
 *   headline  — one sentence a homeowner can read without alarm.
 *   cause     — what actually happened, for the operator.
 *   action    — what to do about it. Different for the two audiences, and
 *               sometimes "nothing, this will fix itself".
 *
 * ============================================================================
 * THE MATCHING IS ON SUBSTRINGS, DELIBERATELY
 * ============================================================================
 *
 * Browsers do not agree on these messages. The same dropped request is
 * "Failed to fetch" in Chrome, "NetworkError when attempting to fetch
 * resource" in Firefox and "Load failed" in Safari. Next has its own
 * vocabulary on top. Matching exact strings would mean a table that is correct
 * on the machine it was written on.
 *
 * Order matters: the first match wins, so the specific patterns are listed
 * before the general ones.
 */

export interface RenderFault {
  /** Shown to the visitor. Never names a model, a vendor or a status code. */
  headline: string;
  /** Shown to the operator. Names exactly what happened. */
  cause: string;
  /** What to do next. */
  action: string;
  /** Is pressing the button again worth anything? */
  retryable: boolean;
}

interface Rule {
  match: RegExp;
  fault: RenderFault;
}

/**
 * THE SIGNATURE THAT MATTERS MOST IS THE FIRST ONE.
 *
 * "An unexpected response was received from the server" is Next's message when
 * a Server Action gets back something that is not an RSC payload — an error
 * page, a platform rejection, a truncated body. It is what a 413 or a
 * function-level kill looks like from inside the browser, and it is the single
 * most likely signature for a render that fails while the analysis on the same
 * page succeeds.
 */
const RULES: readonly Rule[] = [
  {
    match: /unexpected response was received|Failed to load response|invalid RSC|Connection closed/i,
    fault: {
      headline:
        'The preview came back in a form the page could not read. Your quote and your details are unaffected.',
      cause:
        'The Server Action returned something that was not an RSC payload — an error page, a truncated body, or a platform rejection. Almost always the response exceeded the serverless response limit (4.5 MB on Vercel) or the function was terminated. Check the Vercel function log for this route.',
      action:
        'The rendered image is returned inline as base64. If it is large this will happen every time — store it and return a URL instead.',
      retryable: false,
    },
  },
  {
    match: /413|Body exceeded|too large|PayloadTooLarge/i,
    fault: {
      headline:
        'That photo was too large to send. Try again with a single, smaller picture.',
      cause:
        'The request body was rejected before the action ran. serverActions.bodySizeLimit in next.config.mjs governs this; it is set to 8mb.',
      action:
        'If bodySizeLimit is already 8mb, the rejection is at the platform edge rather than at Next, and the photo pipeline ceiling needs lowering instead.',
      retryable: true,
    },
  },
  {
    match: /aborted|AbortError|timed? ?out|ETIMEDOUT/i,
    fault: {
      headline:
        'The preview took too long and we stopped waiting. Your quote is unaffected — try it once more.',
      cause:
        'The request was cancelled before a response arrived: either the route hit maxDuration, or the image provider exceeded its own timeout in lib/ai/images.ts.',
      action:
        'maxDuration is 300 on the tool page and the homepage. If this is common, the provider is slow rather than the route being short.',
      retryable: true,
    },
  },
  {
    match: /Failed to fetch|NetworkError|Load failed|ERR_INTERNET|ERR_NETWORK|offline/i,
    fault: {
      headline:
        'The preview could not be sent. Check your connection — your quote and your details are unaffected.',
      cause:
        'The request never completed at the transport layer. This is the genuine network case: a dropped mobile connection, a captive portal, or the tab losing the network mid-request.',
      action: 'Retrying is worth it. If it repeats on a strong connection, it is not the network.',
      retryable: true,
    },
  },
  {
    match: /server_exception/i,
    fault: {
      headline:
        'The preview could not be produced. That is a fault on our side — your quote and your details are unaffected.',
      cause:
        'Something threw inside visualiseAction. The exception name and message follow. Unguarded calls on that path include uploadFloorPhoto, checkBudget and recordAiJob.',
      action: 'Retrying will not help until the underlying throw is fixed.',
      retryable: false,
    },
  },
  {
    match: /rate|429/i,
    fault: {
      headline: 'The preview is busy right now. Give it a minute and try again.',
      cause: 'A rate limit was hit — either the per-IP guard in lib/quote/guards.ts or the provider.',
      action: 'Wait, then retry.',
      retryable: true,
    },
  },
  {
    match: /budget|ceiling|over_budget/i,
    fault: {
      headline:
        'Previews are paused for today. Your quote and your details are unaffected.',
      cause: "The daily AI spend ceiling is used up. Nothing is broken — this is the ceiling doing its job.",
      action: 'Raise the ceiling, or wait for the day to roll over.',
      retryable: false,
    },
  },
  {
    match: /not_configured|no_provider|401|403|unauthor/i,
    fault: {
      headline:
        'The preview is unavailable right now. Your quote and your details are unaffected.',
      cause:
        'No image provider was reachable: a missing or rejected OPENROUTER_API_KEY, or every candidate in the chain unconfigured.',
      action: 'Check the key in Vercel, then /api/health/models.',
      retryable: false,
    },
  },
  {
    match: /invalid_request|404/i,
    fault: {
      headline:
        'The preview is unavailable right now. Your quote and your details are unaffected.',
      cause:
        'A model in the image chain was rejected by the provider — usually a slug that has been retired.',
      action: 'Open /api/health/models. Anything marked "missing" is the cause.',
      retryable: false,
    },
  },
  {
    match: /content_filter|safety|blocked/i,
    fault: {
      headline:
        'The preview could not be made from that photo. Try a different picture of the same floor.',
      cause: "The provider's safety filter refused the image or the prompt.",
      action: 'A photo with people or number plates in it will do this. Retry with a plain floor shot.',
      retryable: true,
    },
  },
];

const UNKNOWN: RenderFault = {
  headline:
    'The preview could not be produced. Your quote and your details are unaffected.',
  cause: 'An unrecognised failure. The raw text follows — it has not been seen before.',
  action:
    'Add a rule for it in lib/quote/renderFaults.ts once the pattern is known, so the next person gets an explanation instead of this.',
  retryable: true,
};

/**
 * Classify a failure from its code and whatever text came with it.
 *
 * BOTH are searched, because the useful words live in different places
 * depending on the layer that failed: a chain failure puts them in the code, a
 * thrown exception puts them in the message.
 */
export function explainRenderFault(code: string, detail?: string | null): RenderFault {
  const hay = (code + ' ' + (detail ?? '')).trim();
  for (const rule of RULES) {
    if (rule.match.test(hay)) return rule.fault;
  }
  return UNKNOWN;
}
