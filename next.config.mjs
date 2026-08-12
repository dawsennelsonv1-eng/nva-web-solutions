/** @type {import('next').NextConfig} */

/**
 * =============================================================================
 * THE ONE LINE THAT WAS BREAKING BOTH PAID PATHS
 * =============================================================================
 *
 * Next caps a Server Action request body at 1 MB by default. This product
 * posts photographs through Server Actions, base64-encoded, on both of the
 * paths that cost money — and base64 inflates bytes by a third.
 *
 * Do the arithmetic against lib/image/pipeline.ts, which is the thing that
 * decides how big those payloads are:
 *
 *   ABSOLUTE_MAX_BYTES        = 512,000 per frame
 *   base64 of that            ≈ 683,000 per frame
 *   analyzePhotoAction sends  3 to 5 frames (MIN_PHOTOS / MAX_PHOTOS)
 *
 * So the measurement call posts somewhere between roughly 0.9 MB and 3.4 MB.
 * The 1 MB default sits in the middle of that range, which is the worst place
 * a limit can sit: it does not fail every time, it fails MOST times, and it
 * fails differently depending on how grainy the concrete was.
 *
 * WHAT IT LOOKED LIKE FROM THE OUTSIDE, and why it was so hard to find:
 *
 * A body-limit rejection happens BEFORE the action's function body runs. So
 * `analyzePhotoAction` — which is written never to throw, and returns a reason
 * object for every internal failure — never got the chance to return anything.
 * The rejection surfaced as an exception at the CALL SITE, in the browser,
 * where both components had a bare `catch` that discarded the error and
 * substituted a generic sentence:
 *
 *   ToolCard.tsx        "Those photos could not be read."   (blames the photos)
 *   FinishVisualiser    "That did not come back."           (blames nothing)
 *
 * Neither is true and neither is actionable. The server logs were clean
 * because the server never ran the code. The ai_jobs ledger was empty because
 * nothing was ever billed. Every diagnostic this codebase has was looking
 * downstream of a request that never arrived.
 *
 * 8 MB, NOT 4 AND NOT 32. Five frames at the pipeline's absolute ceiling is
 * about 3.4 MB, so 8 MB is roughly twice the worst case this client can
 * legitimately produce — enough headroom that a future MAX_PHOTOS of six does
 * not silently reintroduce the same bug, and not so much that the limit stops
 * being a limit. The real defence against an oversized payload is
 * validateImagePayload in lib/quote/guards.ts, which runs per image and
 * rejects with a message a homeowner can act on. This value only has to stop
 * the transport from failing before that check can speak.
 *
 * VERIFY — WHICH KEY, AND CHECK YOUR NEXT VERSION BEFORE DEPLOYING:
 *   Next 14:  experimental.serverActions.bodySizeLimit   <- what is written below
 *   Next 15+: serverActions.bodySizeLimit                <- moved to top level
 *
 * Confirm with:  npx next --version
 *
 * On Next 15 the key below is ignored with a config warning rather than a
 * build failure, so a wrong guess here shows up as the bug NOT being fixed
 * rather than as a red deploy — which is exactly the failure mode this whole
 * phase exists to eliminate. Check the version.
 */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },
};
export default nextConfig;
