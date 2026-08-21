"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Static export has no server to issue a real redirect, so the default
 * entry point (Log → Food) is reached by replacing straight to /log on
 * mount — matches the client-side nav every other in-app Link already uses. */
export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/log");
  }, [router]);

  return null;
}
