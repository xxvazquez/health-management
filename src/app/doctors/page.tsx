"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The Doctors page became "Medical" — this keeps old links, bookmarks and
 * the PWA's saved routes working. Carries the hash so `/doctors#followups`
 * etc. still land on the right tab. */
export default function DoctorsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/medical" + window.location.hash);
  }, [router]);
  return null;
}
