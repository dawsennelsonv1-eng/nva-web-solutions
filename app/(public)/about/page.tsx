import type { Metadata } from 'next';
import Link from 'next/link';
import { GradientField } from '@/components/site/GradientField';

/**
 * app/(public)/about/page.tsx — NEW ROUTE, PHASE 15C.
 *
 * WHY THIS EXISTS: components/site/Sections.tsx has linked to /about, /support,
 * /privacy and /terms from the footer since 13B, and none of the four routes
 * were ever built. Every visitor who tapped a footer link got the 404. That is
 * a real defect on the one page whose argument is that it does not overstate
 * what exists, and it is fixed by building the four pages rather than by
 * deleting the links — a site with no terms page is worse than a site with a
 * short one.
 *
 * IT MOUNTS ITS OWN GradientField. The field cannot be moved to
 * app/(public)/layout.tsx yet: `.public-ground:has(.gf)` goes transparent for
 * any subtree containing a field, so mounting it in the layout would drop
 * /categories, /pricing, /queue and /demo — all still on the old light system,
 * all still setting ink text on a light ground — onto a dark field and make
 * their copy unreadable. Per-route is correct until those are restyled.
 *
 * THE COPY IS TRUE AND DELIBERATELY SMALL. There is no team page, no founding
 * story, no photograph of an office. One person builds this from a phone, the
 * install count is in single figures, and pretending otherwise on the page a
 * suspicious buyer checks first would undo every honesty mechanism in the rest
 * of the codebase.
 */

export const metadata: Metadata = {
  title: 'About',
  description:
    'Who builds Girder, what it is for, and what it deliberately does not do.',
};

export default function AboutPage() {
  return (
    <>
      <GradientField />
      <article className="pr">
        <p className="n15-eyebrow">About</p>
        <h1>Software for the part of the job that happens before the job.</h1>

        <p>
          Girder is built by NVA Digital Solutions. It puts a working quoting
          tool on a contractor&apos;s own website — the customer answers three or
          four questions, gets a real price range calculated from that
          contractor&apos;s own rates, and leaves their name and number whether or
          not they book.
        </p>

        <h2>Why it exists</h2>
        <p>
          Most trade websites end at a contact form. Somebody deciding at nine at
          night whether to repaint a garage floor does not want to fill in a form
          and wait until Tuesday. They want a number. Whoever gives them one
          first usually gets the job, and it is very often not the best
          contractor — it is the one who answered.
        </p>
        <p>
          That gap is a software problem, and it is a solvable one. The
          arithmetic behind a quote is not a secret; it is a rate per square
          foot, a prep charge, a few condition adjustments and a minimum. Every
          contractor already has those numbers written down somewhere. This puts
          them on the website and lets them run.
        </p>

        <h2>How it is built</h2>
        <ul>
          <li>
            The price never comes from a model. It comes from a rate table the
            contractor owns and edits, which is why a quote still works when the
            AI is down.
          </li>
          <li>
            The AI reads a photograph and suggests the surface condition. That is
            the whole of its job, and its suggestion is bounded by rules the
            contractor set.
          </li>
          <li>
            Lead capture does not depend on billing state. A lapsed payment, a
            used-up usage cap or a provider outage costs the extras — never the
            enquiry.
          </li>
          <li>
            The full pricing model is published on the homepage. Not a
            description of one, the actual arithmetic, with every rate visible.
          </li>
        </ul>

        <h2>What it is not</h2>
        <p>
          It does not create traffic. It converts the people already looking at
          you. If nobody is visiting your site, this is the wrong purchase and
          the honest thing is to say so before you pay rather than after.
        </p>
        <p>
          It is also not a franchise, an agency retainer, or a lead-selling
          arrangement. There is a setup fee and a monthly fee. No share of a job,
          no commission on a lead, no percentage of anything.
        </p>

        <h2>Who is behind it</h2>
        <p>
          One person, working with a small team, currently focused on epoxy floor
          coating contractors in the Dallas–Fort Worth area. The install count is
          small because this launched recently — it is on the homepage, counted
          from the database, and it is not rounded up. Being early is the offer:
          founding pricing is locked for the life of the account.
        </p>

        <div className="pr-actions">
          <Link href="/demo" className="n15-btn n15-btn-primary">
            Try the quoting tool
          </Link>
          <Link href="/support" className="n15-btn n15-btn-ghost">
            Get in touch
          </Link>
        </div>
      </article>
    </>
  );
}
