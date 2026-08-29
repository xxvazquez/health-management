"use client";

import { useState, type FormEvent } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { createPartnerInvite, redeemPartnerInvite, type PartnerInvite } from "@/lib/supabase/partner";

const ACCENT = "var(--series-magenta)";

/** Shown on the Notes page until the signed-in user has a partner linked —
 * nothing else here works without one. Two independent flows on one
 * screen (generate a code to share, or redeem one you were given) since
 * either person in a couple might be the one who opens Lauva first. */
export function PartnerLinkPanel({ onLinked }: { onLinked: () => void }) {
  const [invite, setInvite] = useState<PartnerInvite | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [codeInput, setCodeInput] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      setInvite(await createPartnerInvite());
    } catch (err) {
      console.error("createPartnerInvite failed", err);
      setGenerateError("Couldn't create a code — try again in a moment.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRedeem(e: FormEvent) {
    e.preventDefault();
    if (!codeInput.trim()) return;
    setRedeeming(true);
    setRedeemError(null);
    try {
      await redeemPartnerInvite(codeInput);
      onLinked();
    } catch (err) {
      setRedeemError(err instanceof Error ? err.message : "Couldn't redeem that code.");
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Connect with your partner
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Link accounts once, then send each other private messages and share reminders. Only one of you needs to do this.
        </p>
      </div>

      <Card tier="supporting">
        <CardTitle subtitle="Share this code with your partner however you like — text, WhatsApp, in person. It works once and expires in 7 days.">
          Invite your partner
        </CardTitle>
        {invite ? (
          <div className="flex items-center justify-between rounded-lg border px-4 py-3" style={{ borderColor: ACCENT, background: "color-mix(in oklab, var(--series-magenta) 10%, var(--surface-1))" }}>
            <span className="text-lg font-semibold tracking-[0.2em] tabular-nums" style={{ color: "var(--text-primary)" }}>
              {invite.code}
            </span>
            <button type="button" onClick={handleGenerate} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
              New code
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="w-full rounded-md px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {generating ? "Generating…" : "Generate a code"}
          </button>
        )}
        {generateError && (
          <p className="mt-2 text-xs" style={{ color: "var(--status-critical)" }}>
            {generateError}
          </p>
        )}
      </Card>

      <Card tier="supporting">
        <CardTitle subtitle="Got a code from your partner? Enter it here to link your accounts.">Have a code?</CardTitle>
        <form onSubmit={handleRedeem} className="flex items-center gap-2">
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="e.g. AB3D9KQZ"
            className="flex-1 rounded-md border px-3 py-2 text-sm tracking-[0.15em] uppercase outline-none"
            style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
          />
          <button
            type="submit"
            disabled={redeeming || !codeInput.trim()}
            className="shrink-0 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: ACCENT }}
          >
            {redeeming ? "Linking…" : "Link"}
          </button>
        </form>
        {redeemError && (
          <p className="mt-2 text-xs" style={{ color: "var(--status-critical)" }}>
            {redeemError}
          </p>
        )}
      </Card>
    </div>
  );
}
