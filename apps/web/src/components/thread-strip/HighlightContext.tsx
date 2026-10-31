"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";

interface Highlight {
  decisionId: number | null;
  setDecisionId(id: number | null): void;
}

const HighlightContext = createContext<Highlight>({ decisionId: null, setDecisionId: () => {} });

/** Shares the decision under the pointer/focus so the thread strip can light up its evidence. */
export function HighlightProvider({ children, initial = null }: { children: ReactNode; initial?: number | null }) {
  const [decisionId, setDecisionId] = useState<number | null>(initial);
  const value = useMemo(() => ({ decisionId, setDecisionId }), [decisionId]);
  return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>;
}

export function useHighlight(): Highlight {
  return useContext(HighlightContext);
}
