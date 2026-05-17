"use client";

import type { FormEvent } from "react";
import { DemoRequestReceipt } from "@/components/screens/home-petition-panels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function isDemoEmailReady(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

/** Owns the locked-workbench demo and personal-key admission surface. */
export function HomeAuthGate(props: {
  demoLinkState: string | null;
  bannerMessage: string;
  demoEmail: string;
  demoReceiptEmail: string | null;
  byokOpen: boolean;
  hasStoredByok: boolean;
  demoRequestPending: boolean;
  byokAdmissionPending: boolean;
  byokValidationPending: boolean;
  byokUnlockPending: boolean;
  byokAdmissionBlocked: boolean;
  apiKey: string;
  password: string;
  resetKeyConfirmOpen: boolean;
  onDemoEmailChange: (value: string) => void;
  onRequestDemo: () => void;
  onOpenByok: () => void;
  onRetryDemoSession: () => void;
  onApiKeyChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onValidateAndStore: () => void;
  onUnlockStoredKey: () => void;
  onOpenResetKeyConfirm: () => void;
  onCancelResetKey: () => void;
  onConfirmResetKey: () => void;
}) {
  function handleDemoSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!props.demoRequestPending && isDemoEmailReady(props.demoEmail)) props.onRequestDemo();
  }

  function handleByokSetupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !props.byokAdmissionPending &&
      !props.byokValidationPending &&
      !props.byokAdmissionBlocked &&
      props.apiKey &&
      props.password.length >= 8
    ) {
      props.onValidateAndStore();
    }
  }

  function handleByokUnlockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !props.byokAdmissionPending &&
      !props.byokUnlockPending &&
      !props.byokAdmissionBlocked &&
      props.password
    ) {
      props.onUnlockStoredKey();
    }
  }

  const demoPanel = (
    <form className="space-y-3" onSubmit={handleDemoSubmit}>
      <div className="space-y-2">
        <Label htmlFor="demo-email">Email for a 24-hour demo</Label>
        <Input
          id="demo-email"
          type="email"
          autoComplete="email"
          value={props.demoEmail}
          onChange={(event) => props.onDemoEmailChange(event.target.value)}
          placeholder="you@example.com"
          required
        />
        <p className="text-xs text-[var(--text-dim)]">
          We email a magic link. The demo uses the Commons Council and our provider credentials —
          your key is not required.
        </p>
      </div>
      {props.demoReceiptEmail ? <DemoRequestReceipt email={props.demoReceiptEmail} /> : null}
      <Button
        type="submit"
        disabled={props.demoRequestPending || !isDemoEmailReady(props.demoEmail)}
        size="lg"
        className="w-full"
      >
        {props.demoRequestPending
          ? "Sending magic link…"
          : props.demoReceiptEmail
            ? "Resend magic link"
            : "Send magic link"}
      </Button>
    </form>
  );

  const byokPanel =
    !props.byokOpen && !props.hasStoredByok ? (
      <button type="button" className="gate-secondary-link" onClick={props.onOpenByok}>
        Use your OpenRouter key — unlock every built-in council
      </button>
    ) : (
      <div className="space-y-3">
        <p className="text-sm leading-6 text-[var(--text-muted)]">
          Your OpenRouter key is encrypted locally in this browser. The server sees the plaintext
          transiently per request. Temporary worker credentials are encrypted on the server for the
          active run and removed with the run ledger.
        </p>
        {props.byokAdmissionBlocked ? (
          <div role="alert" className="alert-danger confirm-panel">
            <p className="m-0 text-sm">
              Demo status is unavailable. Retry the check before using your OpenRouter key.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={props.onRetryDemoSession}
              disabled={props.byokAdmissionPending}
            >
              {props.byokAdmissionPending ? "Checking…" : "Retry demo status"}
            </Button>
          </div>
        ) : null}
        {!props.hasStoredByok ? (
          <form className="space-y-3" onSubmit={handleByokSetupSubmit}>
            <div className="space-y-2">
              <Label htmlFor="byok-api-key">OpenRouter API key</Label>
              <Input
                id="byok-api-key"
                type="password"
                autoComplete="off"
                value={props.apiKey}
                onChange={(event) => props.onApiKeyChange(event.target.value)}
                placeholder="sk-or-v1-..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="byok-password">Local Password</Label>
              <Input
                id="byok-password"
                type="password"
                autoComplete="new-password"
                value={props.password}
                onChange={(event) => props.onPasswordChange(event.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={
                props.byokAdmissionPending ||
                props.byokValidationPending ||
                props.byokAdmissionBlocked ||
                !props.apiKey ||
                props.password.length < 8
              }
            >
              {props.byokValidationPending
                ? "Checking key…"
                : props.byokAdmissionPending
                  ? "Checking demo…"
                  : "Save and unlock key"}
            </Button>
          </form>
        ) : (
          <form className="space-y-3" onSubmit={handleByokUnlockSubmit}>
            <div className="space-y-2">
              <Label htmlFor="unlock-password">Unlock Password</Label>
              <Input
                id="unlock-password"
                type="password"
                autoComplete="current-password"
                value={props.password}
                onChange={(event) => props.onPasswordChange(event.target.value)}
                placeholder="Decrypt your stored key"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              disabled={
                props.byokAdmissionPending ||
                props.byokUnlockPending ||
                props.byokAdmissionBlocked ||
                !props.password
              }
            >
              {props.byokUnlockPending
                ? "Unlocking stored key…"
                : props.byokAdmissionPending
                  ? "Checking demo…"
                  : "Unlock stored key"}
            </Button>
            {props.resetKeyConfirmOpen ? (
              <div className="panel confirm-panel">
                <div>
                  <p className="m-0 font-semibold">Remove this browser&apos;s stored key?</p>
                  <p className="m-0 mt-1 text-sm text-[var(--text-dim)]">
                    Archive entries stay intact and OpenRouter is unaffected, but this browser
                    cannot recover the encrypted key after it is removed.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={props.onCancelResetKey}>
                    Keep stored key
                  </Button>
                  <Button variant="danger" size="sm" onClick={props.onConfirmResetKey}>
                    Remove local encrypted key
                  </Button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="gate-secondary-link"
              onClick={props.onOpenResetKeyConfirm}
            >
              Use a different key
            </button>
          </form>
        )}
      </div>
    );

  return (
    <Card className="gate">
      {props.demoLinkState ? (
        <div role="status" className="gate-banner">
          {props.bannerMessage}
        </div>
      ) : null}

      <div>
        <p className="gate-eyebrow">Ask the council</p>
        <h1 className="sr-only">Ask</h1>
        <h2 className="gate-headline mt-2">Ask once. Get one answer you can inspect.</h2>
        <p className="gate-lede mt-4">
          The Seven sends your question to six independent reviewers, compares their work, and
          returns one final answer. You can copy the answer, inspect how it was made, save it, and
          run the question again.
        </p>
      </div>

      {props.hasStoredByok ? (
        <>
          {byokPanel}
          <div className="gate-divider">or request a fresh demo</div>
          {demoPanel}
        </>
      ) : (
        <>
          {demoPanel}
          <div className="gate-divider">or use your own OpenRouter key</div>
          {byokPanel}
        </>
      )}
    </Card>
  );
}
