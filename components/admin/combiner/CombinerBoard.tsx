'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { updatePreviewAction, type CombinerBootstrap } from '@/app/actions/combiner';
import { TEMPLATES, TYPOGRAPHY_OPTIONS, BUTTON_STYLES } from '@/lib/combiner/designOptions';
import { CombinerDndProvider, DropCanvasTarget, PaletteRow, type PaletteItem } from './Palette';
import { LogoPanel, type LogoPanelValue } from './LogoPanel';
import { PreviewFrame } from './PreviewFrame';
import { DeploymentPanel } from './DeploymentPanel';
import { PresetsPanel } from './PresetsPanel';
import type { StyleVariant } from '@/types';

/**
 * components/admin/combiner/CombinerBoard.tsx — THE ORCHESTRATOR.
 *
 * Holds staged state locally (useState — nothing here is persisted except
 * through the debounced updatePreviewAction call, which writes to
 * prototype_previews, never to the real tables). On every meaningful
 * change: recompute, call updatePreviewAction (400ms debounced so a fast
 * drag or a run of keystrokes doesn't fire a request per pixel), then
 * postMessage the iframe to refresh once the write lands.
 *
 * MOBILE-FIRST LAYOUT (item 7): a single column throughout — palettes,
 * then canvas, then preview, then deploy — never a side-by-side desktop
 * arrangement that "technically reflows." Every palette chip carries both
 * the drag handle and the tap-to-select fallback (Palette.tsx); this file
 * doesn't need its own touch-specific branch because that guarantee lives
 * one level down, in the one place it needs to be true.
 */
export function CombinerBoard({ bootstrap }: { bootstrap: CombinerBootstrap }) {
  const [templateId, setTemplateId] = useState(bootstrap.stagedTemplate.templateId);
  const [typographyId, setTypographyId] = useState(bootstrap.stagedTemplate.typographyId);
  const [buttonStyleId, setButtonStyleId] = useState(bootstrap.stagedTemplate.buttonStyleId);
  const [styleVariant, setStyleVariant] = useState<StyleVariant>(bootstrap.stagedTemplate.styleVariant);
  const [brand, setBrand] = useState<LogoPanelValue>({
    primaryHex: bootstrap.stagedBrand.primaryHex,
    secondaryHex: bootstrap.stagedBrand.secondaryHex,
    accentHex: bootstrap.stagedBrand.accentHex,
    logoPath: bootstrap.stagedBrand.logoPath,
    logoPreviewUrl: null,
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const pushUpdate = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await updatePreviewAction({
        prototypeId: bootstrap.prototypeId,
        primaryHex: brand.primaryHex,
        secondaryHex: brand.secondaryHex,
        accentHex: brand.accentHex,
        logoPath: brand.logoPath,
        templateId,
        typographyId,
        buttonStyleId,
        styleVariant,
      });
      iframeRef.current?.contentWindow?.postMessage('nva-combiner-refresh', window.location.origin);
    }, 400);
  }, [bootstrap.prototypeId, brand, templateId, typographyId, buttonStyleId, styleVariant]);

  useEffect(() => {
    pushUpdate();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, typographyId, buttonStyleId, styleVariant, brand]);

  const templateItems: PaletteItem[] = useMemo(
    () => TEMPLATES.map((t) => ({ id: t.id, label: t.name })),
    []
  );
  const typographyItems: PaletteItem[] = useMemo(
    () =>
      TYPOGRAPHY_OPTIONS.map((t) => ({
        id: t.id,
        label: t.name,
        render: <span className={'font-display text-sm ' + t.className}>Aa</span>,
      })),
    []
  );
  const buttonItems: PaletteItem[] = useMemo(
    () =>
      BUTTON_STYLES.map((b) => ({
        id: b.id,
        label: b.name,
        render: (
          <span
            className={
              'block h-4 w-8 rounded-milled ' +
              (b.variant === 'solid' ? 'bg-hazard' : 'border border-hazard bg-transparent')
            }
          />
        ),
      })),
    []
  );
  const variantItems: PaletteItem[] = [
    { id: 'light', label: 'Light' },
    { id: 'dark-industrial', label: 'Dark' },
  ];

  function handleDrop(itemId: string) {
    if (TEMPLATES.some((t) => t.id === itemId)) setTemplateId(itemId);
    else if (TYPOGRAPHY_OPTIONS.some((t) => t.id === itemId)) setTypographyId(itemId);
    else if (BUTTON_STYLES.some((b) => b.id === itemId)) setButtonStyleId(itemId);
    else if (itemId === 'light' || itemId === 'dark-industrial') setStyleVariant(itemId);
  }

  return (
    <div className="space-y-6">
      <CombinerDndProvider onDrop={handleDrop}>
        <div className="space-y-4">
          <PaletteRow title="Templates" items={templateItems} activeId={templateId} onSelect={setTemplateId} />
          <PaletteRow title="Typography" items={typographyItems} activeId={typographyId} onSelect={setTypographyId} />
          <PaletteRow title="Button style" items={buttonItems} activeId={buttonStyleId} onSelect={setButtonStyleId} />
          <PaletteRow title="Appearance" items={variantItems} activeId={styleVariant} onSelect={(id) => setStyleVariant(id as StyleVariant)} />
        </div>

        <DropCanvasTarget>
          <p className="font-data text-xs uppercase tracking-wide text-rule">Staged environment</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-data text-xs">
            <dt className="text-rule">Template</dt><dd>{templateId}</dd>
            <dt className="text-rule">Typography</dt><dd>{typographyId}</dd>
            <dt className="text-rule">Button</dt><dd>{buttonStyleId}</dd>
            <dt className="text-rule">Appearance</dt><dd>{styleVariant}</dd>
          </dl>
          <p className="mt-2 font-data text-[10px] text-rule">
            Drag a chip here, or just tap one above — either works.
          </p>
        </DropCanvasTarget>
      </CombinerDndProvider>

      <LogoPanel prototypeId={bootstrap.prototypeId} value={brand} onChange={setBrand} />

      <PreviewFrame ref={iframeRef} prototypeId={bootstrap.prototypeId} />

      <PresetsPanel
        prototypeId={bootstrap.prototypeId}
        current={{ templateId, typographyId, buttonStyleId, styleVariant, primaryHex: brand.primaryHex }}
        onApplied={() => window.location.reload()}
      />

      <DeploymentPanel
        prototypeId={bootstrap.prototypeId}
        currentStatus={bootstrap.status}
        currentExpiresAt={bootstrap.expiresAt}
      />
    </div>
  );
}
