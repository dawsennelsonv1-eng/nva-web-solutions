'use client';

import { useDraggable, useDroppable, DndContext, type DragEndEvent } from '@dnd-kit/core';
import type { ReactNode } from 'react';

/**
 * components/admin/combiner/Palette.tsx — ONE generic draggable palette,
 * used four times (Templates, Typography, Button Styles, Colours).
 *
 * ITEM 7, THE NON-NEGOTIABLE PART: "there must be a non-drag fallback path
 * to every action." Every chip below is BOTH a dnd-kit draggable AND a
 * plain onClick handler firing the identical onSelect callback — dragging
 * it onto the canvas and tapping it produce the exact same state change.
 * dnd-kit's PointerSensor already supports touch, so dragging itself works
 * on a phone; the tap fallback exists for the admin who would rather not
 * drag at all, mid-call, one-handed. "If the combiner is only usable on
 * desktop it is useless to me" — the tap path is what makes that not true
 * even before touch-drag is considered.
 */

export interface PaletteItem {
  id: string;
  label: string;
  /** A small swatch/preview rendered on the chip — colour hex, or a text sample. */
  render?: ReactNode;
}

export function PaletteChip({
  item,
  active,
  onSelect,
}: {
  item: PaletteItem;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: 'palette:' + item.id, data: { itemId: item.id } });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      onClick={() => onSelect(item.id)}
      aria-pressed={active}
      className={
        'flex min-h-[3.5rem] min-w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1 rounded-milled border px-2 py-2 text-center transition-colors duration-step touch-none ' +
        (isDragging ? 'opacity-40' : '') +
        (active ? ' border-ink bg-ink text-sheet' : ' border-rule bg-sheet')
      }
    >
      {item.render}
      <span className="font-data text-[10px] uppercase tracking-wide">{item.label}</span>
    </button>
  );
}

export function PaletteRow({
  title,
  items,
  activeId,
  onSelect,
}: {
  title: string;
  items: PaletteItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <p className="font-data text-xs uppercase tracking-wide text-rule">{title}</p>
      <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <PaletteChip key={item.id} item={item} active={item.id === activeId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

/**
 * The drop canvas target. Wraps whatever draggable palettes sit above it in
 * a shared DndContext and translates a successful drop into the same
 * onSelect(itemId) call the tap fallback uses — one state-change path,
 * two ways to trigger it.
 */
export function CombinerDndProvider({
  onDrop,
  children,
}: {
  onDrop: (itemId: string) => void;
  children: ReactNode;
}) {
  function handleDragEnd(event: DragEndEvent) {
    if (event.over?.id !== 'drop-canvas') return;
    const itemId = event.active.data.current?.itemId as string | undefined;
    if (itemId) onDrop(itemId);
  }

  return <DndContext onDragEnd={handleDragEnd}>{children}</DndContext>;
}

export function DropCanvasTarget({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'drop-canvas' });
  return (
    <div
      ref={setNodeRef}
      className={
        'rounded-milled border-2 border-dashed p-4 transition-colors duration-step ' +
        (isOver ? 'border-hazard bg-hazard/5' : 'border-rule bg-concrete')
      }
    >
      {children}
    </div>
  );
}
