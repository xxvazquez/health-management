"use client";

import { useState, type FormEvent } from "react";
import { Field } from "@/components/ui/Field";
import { FormGroup } from "@/components/ui/FormGroup";
import { ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";
import { Button } from "@/components/ui/Button";
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
    <div className="mx-auto flex max-w-md flex-col gap-5">
      <div>
        <h1 className="text-2xl leading-tight font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Connect with your partner
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Link accounts once, then send each other private messages and share reminders. Only one of you needs to do this.
        </p>
      </div>

      <FormGroup
        title="Invite your partner"
        footer={
          <>
            Share this code with your partner however you like — text, WhatsApp, in person. It works once and expires in 7 days.
            {generateError && (
              <span className="mt-1 block" style={{ color: "var(--status-critical)" }}>
                {generateError}
              </span>
            )}
          </>
        }
      >
        {invite ? (
          <div className="flex min-h-11 items-center justify-between gap-3 px-3.5">
            <span className="text-base font-semibold tracking-[0.2em] tabular-nums" style={{ color: "var(--text-primary)" }}>
              {invite.code}
            </span>
            <button type="button" onClick={handleGenerate} className="text-sm font-medium" style={{ color: ACCENT }}>
              New code
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={generating}
            className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium disabled:opacity-50"
            style={{ color: ACCENT }}
          >
            {generating ? "Generating…" : "Generate a code"}
          </button>
        )}
      </FormGroup>

      <form onSubmit={handleRedeem} className="flex flex-col gap-3">
        <FormGroup
          title="Have a code?"
          footer={
            <>
              Got a code from your partner? Enter it here to link your accounts.
              {redeemError && (
                <span className="mt-1 block" style={{ color: "var(--status-critical)" }}>
                  {redeemError}
                </span>
              )}
            </>
          }
        >
          <Field label="Code">
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. AB3D9KQZ"
              className={`${ROW_TEXT_CLS} tracking-[0.15em] uppercase`}
              style={ROW_STYLE}
            />
          </Field>
        </FormGroup>
        <Button type="submit" size="lg" accent={ACCENT} disabled={redeeming || !codeInput.trim()}>
          {redeeming ? "Linking…" : "Link"}
        </Button>
      </form>
    </div>
  );
}
