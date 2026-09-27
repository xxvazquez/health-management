"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The slot in the Trends title row that a dashboard can fill with its own
 * controls (its date-range filter), so they share the "Trends" row instead
 * of taking a half-empty row of their own. */
export const TrendsActionsSlot = createContext<HTMLElement | null>(null);

/** Renders its children into the Trends title row. */
export function TrendsActions({ children }: { children: ReactNode }) {
  const slot = useContext(TrendsActionsSlot);
  return slot ? createPortal(children, slot) : null;
}
