import type { Metadata } from 'next';
import { GradientField } from '@/components/site/GradientField';
import { RequestForm } from '@/components/site/RequestForm';
import { toolPageFor } from '@/lib/tools/catalogue';

/**
 * app/(public)/start/page.tsx — "Get this on my site."
 *
 * ============================================================================
 * A FORM INSTEAD OF A CALENDAR, AND THAT IS THE POINT
 * ============================================================================
 *
 * The obvious thing here is a booking link. It is the wrong thing twice over.
 *
 * It asks a stranger to give up half an hour before he knows what he is
 * getting, which loses the ones who would rather type than talk — and on a
 * first contact that is most of them. And a call is a worse instrument for
 * this than a form: the five facts below are exactly what is needed to build a
 * branded working version, they are easier to type than to say, and a written
 * answer can be re-read while the thing is being built.
 *
 * So the sequence is: he answers five short questions, we build the branded
 * version, we send him a link to the working thing, and only then does anyone
 * need to talk.
 *
 * ============================================================================
 * ?tool= IS CONTEXT, NEVER A GATE
 * ============================================================================
 *
 * A visitor arriving from a tool page carries its id, which is recorded with
 * the request and used to name the tool in the heading. An unknown or missing
 * id changes the wording and nothing else — the form still submits and the
 * request still lands. A query parameter that can 404 a form is a form that
 * loses requests to a mistyped link.
 */

export const metadata: Metadata = {
  title: 'Get this on your site',
  description:
    'Answer five short questions. We build the branded version and send you a link to the working thing before you pay for anything.',
};

export default function StartPage({
  searchParams,
}: {
  searchParams: { tool?: string };
}) {
  const toolId = searchParams.tool ?? null;
  const page = toolId ? toolPageFor(toolId) : undefined;

  return (
    <>
      <GradientField />
      <article className="pr pr-wide">
        <p className="n15-eyebrow">Get it running</p>
        <h1>
          {page ? 'Put this on your website' : 'Put one of these on your website'}
        </h1>

        {page && <p className="n15-lede rf-context">{page.title}</p>}

        <p className="n15-body">
          Five short questions, and only three of them are required. We take it
          from there: we pull your logo and colours off your existing site, build
          the branded version, and send you a link to the working thing. You look
          at it before you pay for anything.
        </p>

        <div className="rf-wrap">
          <RequestForm
            kind="tool_install"
            toolId={page ? page.id : null}
            source={page ? 'tool_page:' + page.id : 'start_direct'}
          />
        </div>
      </article>
    </>
  );
}
