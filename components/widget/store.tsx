'use client';

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand/vanilla';
import {
  createQuoteMachine,
  type CreateMachineArgs,
  type QuoteMachine,
} from '@/lib/quote/machine';

/**
 * components/widget/store.tsx — the React binding for the Phase 3 vanilla
 * store. Phase 3 kept the machine framework-free so it could be tested
 * without a renderer; this is the only file that knows about React, and it is
 * deliberately thin.
 *
 * ONE STORE PER WIDGET INSTANCE, via context rather than a module singleton:
 * the public hub, the demo and a prototype preview can all be mounted at once
 * (Phase 5 and Phase 9 both do this), and a module-level store would have them
 * share a funnel and a mode. Mode is per-instance because the widget's whole
 * contract is that mode is explicit (R-123).
 *
 * FILE_TREE.md addition: components/widget/store.tsx [4]
 */

const StoreContext = createContext<StoreApi<QuoteMachine> | null>(null);

export function QuoteMachineProvider({
  children,
  ...args
}: CreateMachineArgs & { children: ReactNode }) {
  const ref = useRef<StoreApi<QuoteMachine>>();
  if (!ref.current) ref.current = createQuoteMachine(args);

  /**
   * Abandonment is recorded on unmount and on the page being hidden.
   * 'visibilitychange' rather than 'beforeunload': mobile Safari and Chrome
   * on Android frequently never fire beforeunload when a user switches apps
   * or closes a tab, and abandoned_step is the single most valuable field in
   * the schema for deciding what gets built after launch. Losing it on the
   * platform the product actually runs on is not acceptable.
   */
  useEffect(() => {
    const store = ref.current;
    if (!store) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') store.getState().markAbandoned();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      store.getState().markAbandoned();
    };
  }, []);

  return <StoreContext.Provider value={ref.current}>{children}</StoreContext.Provider>;
}

export function useQuoteMachine<T>(selector: (s: QuoteMachine) => T): T {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useQuoteMachine must be used inside <QuoteMachineProvider>');
  return useStore(store, selector);
}

export function useQuoteStore(): StoreApi<QuoteMachine> {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useQuoteStore must be used inside <QuoteMachineProvider>');
  return store;
}
