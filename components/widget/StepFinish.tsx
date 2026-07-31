'use client';

import { useState } from 'react';

/**
 * STEP 2 — the finish selector.
 *
 * SWATCHES ARE CSS, NOT IMAGERY, and that is a deliberate departure from
 * "lazy-load swatch imagery". Twenty-plus swatch photographs is twenty-plus
 * requests on a phone on 4G, and even lazy-loaded they compete for bandwidth
 * with the thing we actually need fast. The colours in the vertical module are
 * real product colours as hex values, so each chip is rendered from tokens the
 * config already carries: a speckle for flake, a directional sheen for
 * metallic, flat for solid. Zero requests, zero LCP contention, and it stays
 * correct when a contractor edits his catalogue. If photographic swatches are
 * ever wanted, they attach to this same chip as a background-image with
 * loading="lazy" and nothing else changes.
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
