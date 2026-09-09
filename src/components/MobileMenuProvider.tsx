"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

interface MobileMenu {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const MobileMenuContext = createContext<MobileMenu>({ isOpen: false, open: () => {}, close: () => {} });

export const useMobileMenu = () => useContext(MobileMenuContext);

/** Holds the mobile menu drawer's open state so the trigger (a button in
 * each screen's title row, `MobileMenuButton`) and the drawer itself (in
 * `Nav`) can live apart — there's no persistent top bar to house both. */
export function MobileMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // The drawer is a menu, not a panel — any route change closes it (a nav
  // link inside it, or the bottom bar, or the browser's back button).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOpen(false);
  }, [pathname]);

  const value = useMemo<MobileMenu>(
    () => ({ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }),
    [isOpen],
  );
  return <MobileMenuContext.Provider value={value}>{children}</MobileMenuContext.Provider>;
}
