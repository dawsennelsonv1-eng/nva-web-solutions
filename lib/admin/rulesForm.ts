/**
 * lib/admin/rulesForm.ts — TURNS A RULES DOCUMENT INTO A FORM, AND BACK.
 *
 * ============================================================================
 * WHY THIS DOES NOT KNOW WHAT A VERTICAL IS
 * ============================================================================
 *
 * Every vertical's rules are shaped differently. Epoxy prices from
 * `baseRateCentsPerSqft` keyed by three finish tiers; painting prices from
 * `coatRateCentsPerSqft` keyed by five sheens and treats prep as a first-class
 * line rather than a rate. Roofing will differ again.
 *
 * So an admin form that hardcodes epoxy's field names would be the exact
 * architectural leak Phase 11 was spent removing — core, or in this case
 * admin, learning a trade's specifics. Every new vertical would need a new
 * form, and forgetting to write one would mean a contractor's rates were
 * uneditable with no error anywhere.
 *
 * This walks the SAVED RULES OBJECT instead. Whatever keys are in the document
 * become fields; whatever is not, does not. A vertical that ships tomorrow gets
 * a working editor the moment its config is seeded, with no code here.
 *
 * Deliberately NOT done by introspecting the zod schema. Walking
 * `schema._def.shape()` would give the same field list and would also couple
 * this file to zod's internal representation, which is not a public API and
 * has changed shape between minor versions. The saved document is the more
 * stable thing to read, and the schema is still the thing that decides whether
 * an edit is legal — see the validation note below.
 *
 * ============================================================================
 * WHAT PROTECTS AGAINST A BAD EDIT
 * ============================================================================
 *
 * Nothing in this file. That is intentional. This file only reshapes data; the
 * ONLY thing that decides whether a rules document is acceptable is the
 * vertical module's own `pricingRuleSchema`, applied in the save action. That
 * schema is `.strict()`, so a key this file invented by mistake is rejected
 * rather than silently written, and its bounds are real — `pctAdjust` is
 * capped between -0.5 and 1 precisely so a typed typo cannot 100x a quote.
 *
 * ============================================================================
 * UNITS — THE `Cents` AND `Pct` CONVENTIONS
 * ============================================================================
 *
 * The codebase already names money fields `...Cents` and proportions `...Pct`.
 * That naming is load-bearing here: it is how this file knows to show a man
 * "5.50" when the stored value is 550, and "15" when the stored value is 0.15.
 *
 * A contractor typing his own rate must type dollars. Storing dollars would be
 * a floating-point money bug; showing cents would get a rate entered 100x
 * wrong on the first day. So the conversion happens at the form boundary, in
 * one place, and the stored document stays integer cents throughout.
 *
 * The risk of a name-based convention is a field that carries money without
 * the suffix. There is none today. If one appears, it renders as a raw number
 * — visibly wrong, rather than silently misconverted by a factor of a hundred.
 */

export type FieldUnit = 'cents' | 'pct' | 'number' | 'text';

export interface RuleField {
  /** Dot path into the rules object, e.g. "baseRateCentsPerSqft.flake". */
  path: string;
  /** Human label derived from the path's last segment. */
  label: string;
  unit: FieldUnit;
  /** The value as the FORM shows it — dollars for cents, percent for pct. */
  display: string;
}

export interface ModifierField {
  index: number;
  id: string;
  label: string;
  /** Percent as typed, e.g. "18" for +18%. */
  pctDisplay: string;
}

export interface RulesForm {
  /** Every scalar leaf outside conditionModifiers. */
  fields: RuleField[];
  /** conditionModifiers gets its own editor — it is a list, not a scalar. */
  modifiers: ModifierField[];
  /** True when the document has a conditionModifiers array at all. */
  hasModifiers: boolean;
}

/**
 * ANCHORED SUFFIXES WERE A BUG, AND AN EXPENSIVE ONE.
 *
 * The first version tested /Cents$/. The two most important keys in the whole
 * epoxy document are `baseRateCentsPerSqft` and `prepRateCentsPerSqft` — both
 * carry Cents in the MIDDLE, so both failed the test and rendered as raw
 * numbers. The form then showed 550 instead of 5.50, and an operator correcting
 * a rate to 5.75 would have written 5.75 CENTS per square foot: a garage floor
 * priced at twenty-eight dollars.
 *
 * The schema would not have caught it. `z.number().int().positive()` accepts 6
 * as happily as 600. Nothing downstream would have complained; the first signal
 * would have been a homeowner receiving an absurd quote.
 *
 * So the test is now unanchored — any key CONTAINING Cents is money, any key
 * containing Pct is a proportion. Order matters: a hypothetical
 * `discountCentsPct` is money first, which is the safer of the two readings
 * because it keeps the value integral.
 */
function unitFor(key: string): FieldUnit {
  if (/Cents/.test(key)) return 'cents';
  if (/Pct/.test(key)) return 'pct';
  return 'number';
}

/** "baseRateCentsPerSqft.flake" -> "Flake". "prepRateCentsPerSqft" -> "Prep rate". */
function labelFor(path: string): string {
  const last = path.split('.').pop() ?? path;
  const words = last
    .replace(/CentsPerSqft$/, ' per sq ft')
    .replace(/CentsPer([A-Z][a-z]+)$/, ' per $1')
    .replace(/Cents$/, '')
    .replace(/Pct$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toDisplay(value: number, unit: FieldUnit): string {
  if (unit === 'cents') return (value / 100).toFixed(2);
  if (unit === 'pct') return String(Math.round(value * 1000) / 10);
  return String(value);
}

function fromDisplay(display: string, unit: FieldUnit): number | null {
  const n = Number(display.replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return null;
  if (unit === 'cents') return Math.round(n * 100);
  if (unit === 'pct') return Math.round(n * 10) / 1000;
  return n;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Flatten a rules document into fields. Recurses one level into nested objects
 * (which is where per-tier rate maps live) and stops there — no rules document
 * in this codebase nests deeper, and unbounded recursion would render a form
 * for a structure nobody can reason about.
 */
export function buildRulesForm(rules: unknown): RulesForm {
  const fields: RuleField[] = [];
  const modifiers: ModifierField[] = [];
  let hasModifiers = false;

  if (!isRecord(rules)) return { fields, modifiers, hasModifiers };

  for (const [key, value] of Object.entries(rules)) {
    if (key === 'conditionModifiers') {
      hasModifiers = true;
      if (Array.isArray(value)) {
        value.forEach((raw, index) => {
          if (!isRecord(raw)) return;
          const pct = typeof raw.pctAdjust === 'number' ? raw.pctAdjust : 0;
          modifiers.push({
            index,
            id: typeof raw.id === 'string' ? raw.id : '',
            label: typeof raw.label === 'string' ? raw.label : '',
            pctDisplay: String(Math.round(pct * 1000) / 10),
          });
        });
      }
      continue;
    }

    if (typeof value === 'number') {
      const unit = unitFor(key);
      fields.push({ path: key, label: labelFor(key), unit, display: toDisplay(value, unit) });
      continue;
    }

    if (isRecord(value)) {
      for (const [childKey, childValue] of Object.entries(value)) {
        if (typeof childValue !== 'number') continue;
        const path = `${key}.${childKey}`;
        // The unit comes from the PARENT key: "baseRateCentsPerSqft" carries
        // the Cents suffix, its children are tier names like "flake".
        const unit = unitFor(key);
        fields.push({
          path,
          label: labelFor(childKey),
          unit,
          display: toDisplay(childValue, unit),
        });
      }
    }
  }

  return { fields, modifiers, hasModifiers };
}

/**
 * Rebuild a rules document from edited fields, starting from the ORIGINAL so
 * that anything this form did not render is carried through untouched.
 *
 * That last part matters: if a vertical's rules gain a key that buildRulesForm
 * does not surface — a nested array, a string, a deeper object — saving must
 * not silently delete it. Starting from a clone of the original and overwriting
 * only known paths means an un-editable field survives an edit rather than
 * being erased by omission. A `.strict()` schema would then reject the
 * document if this file had invented anything, so both directions are covered.
 */
export function applyRulesForm(
  original: unknown,
  fields: RuleField[],
  modifiers: ModifierField[],
  hasModifiers: boolean
): { rules: Record<string, unknown> } | { error: string } {
  if (!isRecord(original)) return { error: 'The stored rules document is not an object.' };

  const next: Record<string, unknown> = JSON.parse(JSON.stringify(original));

  for (const f of fields) {
    const value = fromDisplay(f.display, f.unit);
    if (value === null) return { error: `"${f.label}" is not a number.` };

    const segments = f.path.split('.');
    const head = segments[0];
    if (head === undefined) return { error: 'Malformed field path.' };

    if (segments.length === 1) {
      next[head] = value;
      continue;
    }
    const child = segments[1];
    if (child === undefined) return { error: 'Malformed field path.' };

    const parent = next[head];
    if (!isRecord(parent)) return { error: `"${head}" is no longer an object.` };
    parent[child] = value;
  }

  if (hasModifiers) {
    const rebuilt: { id: string; label: string; pctAdjust: number }[] = [];
    for (const m of modifiers) {
      const id = m.id.trim();
      const label = m.label.trim();
      if (!id && !label) continue; // a blank row is a removal, not an error
      if (!id) return { error: 'A modifier has a label but no id.' };
      if (!label) return { error: `Modifier "${id}" has no label.` };
      const pct = Number(m.pctDisplay.replace(/[^0-9.\-]/g, ''));
      if (!Number.isFinite(pct)) return { error: `Modifier "${id}" has a non-numeric percent.` };
      rebuilt.push({ id, label, pctAdjust: Math.round(pct * 10) / 1000 });
    }
    const seen = new Set<string>();
    for (const m of rebuilt) {
      if (seen.has(m.id)) return { error: `Two modifiers share the id "${m.id}".` };
      seen.add(m.id);
    }
    next.conditionModifiers = rebuilt;
  }

  return { rules: next };
}
