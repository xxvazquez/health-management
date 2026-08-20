import { supabase, supabaseConfigured } from "./client";

export const BUG_TYPES = ["Wrong data", "Sync issue", "Display / layout", "Crash / error", "Other"] as const;
export type BugType = (typeof BUG_TYPES)[number];

export interface BugReportInput {
  bugType: BugType;
  location: string;
  comment: string;
}

/** Same "is cloud set up" flag as auth/sync — bug reporting rides the same
 * Supabase project, via its report-bug Edge Function. */
export const bugReportingConfigured = supabaseConfigured;

export async function submitBugReport(input: BugReportInput): Promise<void> {
  if (!supabase) throw new Error("Cloud reporting isn't set up for this deployment.");

  const { error } = await supabase.functions.invoke("report-bug", {
    body: {
      bugType: input.bugType,
      location: input.location,
      comment: input.comment,
      page: typeof window !== "undefined" ? window.location.pathname : "",
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    },
  });

  if (error) throw error;
}
