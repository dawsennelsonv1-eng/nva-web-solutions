'use client';

import { useState } from 'react';
import { FinishPhoto } from '@/components/site/FinishPhoto';
import { finishPhotoFor } from '@/lib/site/finish-photos';

/**
 * STEP 2 — the finish selector.
 *
 * COLOUR CHIPS ARE CSS, NOT IMAGERY, and that is a deliberate departure from
 * "lazy-load swatch imagery". Twenty-plus swatch photographs is twenty-plus
 * requests on a phone on 4G, and even lazy-loaded they compete for bandwidth
 * with the thing we actually need fast. The colours in the vertical module are
 * real product colours as hex values, so each chip is rendered from tokens the
 * config already carries: a speckle for flake, a directional sheen for
 * metallic, flat for solid. Zero requests, zero LCP contention, and it stays
 * correct when a contractor edits his catalogue.
 *
 * ============================================================================
 * PHASE 14: ONE PHOTOGRAPH PER FINISH. NOT ONE PER COLOUR.
 * ============================================================================
 *
 * The original note here said photographic swatches would attach to the chip
 * itself. On reflection that is the wrong place for them, and the reason is
 * the distinction the two things carry:
 *
 *     THE CHIP SHOWS THE COLOUR. THE PHOTOGRAPH SHOWS THE MATERIAL.
 *
 * A hex value is a truthful representation of a colour and a poor one of a
 * surface — nothing in #9C5B33 tells a homeowner that metallic epoxy moves and
 * pools while flake is a speckled aggregate. That difference is exactly what a
 * person choosing a floor is trying to see, and it is a property of the FINISH
 * SYSTEM, not of the colour. Copper Burl and Titanium are both metallic; one
 * photograph shows what metallic looks like and serves them both.
 *
 * So the photograph is rendered ONCE per finish, inside the expanded panel,
 * above the colour grid. Three finishes means at most three images, and only
 * one is ever open at a time. The original bandwidth objection is answered by
 * arithmetic rather than abandoned: three lazy images, not twenty-two.
 *
 * The images are FINISH REFERENCE, never portfolio. FinishPhoto carries the
 * caption and the missing-file fallback; see lib/site/finish-photos.ts for the
 * honesty constraint on what they may claim. A contractor's own installs are
 * not shown here and there is no field on the type to put one in.
 *
 * `verticalId` IS OPTIONAL, so every existing call site compiles unchanged and
 * simply renders no photograph. A vertical with no photography set — or one
 * whose files have not been uploaded yet — degrades to exactly the pre-14
 * behaviour rather than to a broken panel.
 *
 * 20+ OPTIONS AT 360px WITHOUT A SCROLL SWAMP: finishes are the outer choice
 * and colours the inner one, so only the selected finish reveals its colours.
 * A visitor sees three tiles, not twenty-two.
 */

export interface FinishColour {
  id: string;
  label: string;
  hex: string;
}

export interface FinishOptionView {
  id: string;
  label: string;
  tierKey: string;
  colours: FinishColour[];
}

export interface StepFinishProps {
  options: FinishOptionView[];
  selectedFinishId: string | null;
  selectedColourId: string | null;
  onSelect: (args: { finishId: string; finishTierKey: string; colourId: string | null }) => void;
  /**
   * Which vertical's finish photography to show. Omit for none — see the
   * header note on why this is optional rather than required.
   */
  verticalId?: string;
}

function chipStyle(finishId: string, hex: string): React.CSSProperties {
  if (finishId.includes('flake')) {
    return {
      backgroundColor: hex,
      backgroundImage:
        'radial-gradient(rgb(255 255 255 / 0.55) 0.5px, transparent 0.6px), radial-gradient(rgb(0 0 0 / 0.4) 0.5px, transparent 0.6px)',
      backgroundSize: '5px 5px, 7px 7px',
      backgroundPosition: '0 0, 2px 3px',
    };
  }
  if (finishId.includes('metallic')) {
    return {
      backgroundColor: hex,
      backgroundImage:
        'linear-gradient(115deg, rgb(255 255 255 / 0.32) 0%, rgb(255 255 255 / 0) 38%, rgb(0 0 0 / 0.28) 72%, rgb(255 255 255 / 0.18) 100%)',
    };
  }
  return { backgroundColor: hex };
}

export function StepFinish({
  options,
  selectedFinishId,
  selectedColourId,
  onSelect,
  verticalId,
}: StepFinishProps) {
  const [openId, setOpenId] = useState<string | null>(selectedFinishId);

  return (
    <div className="space-y-4">
      <h2 className="font-display font-condensed text-xl font-bold">Pick a finish</h2>

      <div className="space-y-2">
        {options.map((f) => {
          const open = openId === f.id;
          const isSelected = selectedFinishId === f.id;
          const lead = f.colours[0];
          return (
            <div
              key={f.id}
              className={
                'overflow-hidden rounded-milled border transition-colors duration-step ' +
                (isSelected ? 'border-ink' : 'border-rule')
              }
            >
              <button
                type="button"
                onClick={() => {
                  setOpenId(open ? null : f.id);
                  onSelect({ finishId: f.id, finishTierKey: f.tierKey, colourId: selectedColourId });
                }}
                aria-expanded={open}
                className="flex min-h-[3.5rem] w-full items-center gap-3 bg-sheet px-3 py-2 text-left"
              >
                <span
                  aria-hidden
                  className="h-9 w-9 shrink-0 rounded-milled border border-rule"
                  style={lead ? chipStyle(f.id, lead.hex) : undefined}
                />
                <span className="flex-1">
                  <span className="block font-display font-condensed text-base font-bold uppercase tracking-wide">
                    {f.label}
                  </span>
                  <span className="block font-data text-xs text-rule">
                    {f.colours.length} colour{f.colours.length === 1 ? '' : 's'}
                  </span>
                </span>
                {isSelected ? (
                  <span className="font-data text-xs uppercase tracking-wide text-cure">selected</span>
                ) : null}
              </button>

              {open ? (
                <div className="border-t bg-concrete p-3">
                  {/* The material, once, above its colours. Only the open
                      finish renders one, so at most a single image is in
                      flight at a time. */}
                  {(() => {
                    const photo = verticalId ? finishPhotoFor(verticalId, f.tierKey) : undefined;
                    if (!photo) return null;
                    return (
                      <div className="mb-3">
                        <FinishPhoto
                          photo={photo}
                          sizes="(min-width: 640px) 420px, 92vw"
                          showCaption
                        />
                      </div>
                    );
                  })()}
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {f.colours.map((c) => {
                      const active = selectedColourId === c.id && selectedFinishId === f.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            onSelect({ finishId: f.id, finishTierKey: f.tierKey, colourId: c.id })
                          }
                          aria-pressed={active}
                          aria-label={c.label}
                          title={c.label}
                          className="group flex flex-col items-center gap-1"
                        >
                          <span
                            className={
                              'h-11 w-11 rounded-milled border transition-transform duration-step ' +
                              (active
                                ? 'border-ink ring-2 ring-hazard ring-offset-2 ring-offset-concrete'
                                : 'border-rule group-active:scale-95')
                            }
                            style={chipStyle(f.id, c.hex)}
                          />
                          <span className="font-data text-[10px] leading-tight text-rule">
                            {c.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

