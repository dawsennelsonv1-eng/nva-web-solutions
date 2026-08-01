'use client';

import { forwardRef } from 'react';

/**
 * components/admin/combiner/PreviewFrame.tsx — item 2, "the ACTUAL /s/[slug]
 * in an iframe... Not a screenshot. Not a mock."
 *
 * Points at app/(client)/s/preview/[prototypeId], which renders THE SAME
 * PrototypeView component the real public route does (see that file's own
 * header) — the only difference is which resolver feeds it. src is set
 * ONCE, on mount; every subsequent update goes through
 * PreviewRefreshListener's postMessage -> router.refresh() path rather than
 * reassigning src, so the iframe never flashes or loses scroll position on
 * a staged change.
 *
 * Fixed to a phone-sized viewport (390px) inside a bordered frame — the
 * whole point of this tool is judging what a contractor sees ON HIS PHONE,
 * so previewing at desktop width would be evaluating the wrong thing.
 */
export const PreviewFrame = forwardRef<HTMLIFrameElement, { prototypeId: string }>(function PreviewFrame(
  { prototypeId },
  ref
) {
  return (
    <div className="mx-auto w-full max-w-[390px]">
      <div className="flex items-center justify-between rounded-t-milled border border-b-0 bg-ink px-3 py-1.5">
        <span className="font-data text-[10px] uppercase tracking-wide text-sheet">Live preview</span>
        <span className="font-data text-[10px] text-sheet/60">390px</span>
      </div>
      <iframe
        ref={ref}
        src={'/s/preview/' + prototypeId}
        title="Prototype preview"
        className="h-[70vh] w-full rounded-b-milled border bg-sheet"
      />
    </div>
  );
});
