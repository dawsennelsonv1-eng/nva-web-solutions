const STEPS = [
  {
    n: '01',
    title: 'A homeowner lands on your site',
    body: 'From your existing traffic — Google, referrals, your truck wrap. This does not create visitors, it converts the ones you already get.',
  },
  {
    n: '02',
    title: 'They price their own job',
    body: 'Surface, finish, size — and a photo if they have one. The engine reads condition straight off it: staining, cracking, prior coatings.',
  },
  {
    n: '03',
    title: 'They leave their number for the real price',
    body: 'The instant range is the hook. Your quote — and your call — closes it. Every lead reaches your inbox the moment it happens.',
  },
];

/**
 * components/marketing/HowItWorks.tsx — three steps, written from the
 * contractor's side of the screen throughout, per OFFER.md's voice rules:
 * plain verbs, sentence case, specific over clever.
 */
export function HowItWorks() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16">
      <h2 className="font-display font-condensed text-2xl font-bold sm:text-3xl">How it works</h2>
      <ol className="mt-8 space-y-6">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-4">
            <span className="font-data text-2xl font-medium text-hazard">{s.n}</span>
            <div>
              <h3 className="font-display font-condensed text-lg font-bold">{s.title}</h3>
              <p className="mt-1 max-w-lg text-base text-rule">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
