"use client";

import type { FormEvent } from "react";
import { DemoEndConfirmation } from "@/components/app/demo-end-confirmation";
import {
  AskAnotherQuestionPanel,
  CouncilChoicePanel,
  DemoCouncilPanel,
  EvidencePicker,
} from "@/components/screens/home-petition-panels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { fetchCouncils } from "@/lib/api";

type CouncilList = Awaited<ReturnType<typeof fetchCouncils>>["councils"];

/** Renders the ask composer and its demo/BYOK council controls. */
export function HomeQuestionComposer(props: {
  activeSessionId: number | null;
  authMode: "demo" | "byok" | "none";
  selectedCouncilName: string;
  query: string;
  submitting: boolean;
  canSubmitWithCouncil: boolean;
  postSubmitComposerNoteVisible: boolean;
  canReuseLastQuestion: boolean;
  demoByokConfirmOpen: boolean;
  demoByokEnding: boolean;
  demoByokError: string | null;
  availableCouncils: CouncilList;
  selectedCouncil: string;
  selectedFiles: File[];
  onQueryChange: (value: string) => void;
  onSubmitQuestion: (event?: FormEvent<HTMLFormElement>) => void | Promise<void>;
  onReuseLastQuestion: () => void;
  onDismissPostSubmitComposerNote: () => void;
  onSelectCouncil: (value: string) => void;
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
  onRequestByokFromDemo: () => void;
  onCancelDemoByok: () => void;
  onConfirmDemoByok: () => void;
}) {
  return (
    <Card className={props.activeSessionId ? "p-4" : "p-5"}>
      <section className="petition-band">
        <p className="docket-meta">
          {props.authMode === "demo" ? (
            <>
              <span>Demo</span>
              <span className="docket-meta-pair">
                <span className="docket-dot">·</span>
                <span className="docket-accent">
                  {props.selectedCouncilName || "The Commons Council"}
                </span>
              </span>
            </>
          ) : (
            <>
              <span>Ask</span>
              {props.selectedCouncilName ? (
                <span className="docket-meta-pair">
                  <span className="docket-dot">·</span>
                  <span className="docket-accent">{props.selectedCouncilName}</span>
                </span>
              ) : null}
            </>
          )}
        </p>

        <form
          className="workbench-form"
          onSubmit={(event) => {
            void props.onSubmitQuestion(event);
          }}
        >
          {props.activeSessionId && props.postSubmitComposerNoteVisible ? (
            <AskAnotherQuestionPanel
              canReuseLastQuestion={props.canReuseLastQuestion}
              onReuseLastQuestion={props.onReuseLastQuestion}
              onDismiss={props.onDismissPostSubmitComposerNote}
            />
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="matter-question">Question</Label>
            <Textarea
              id="matter-question"
              value={props.query}
              onChange={(event) => props.onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void props.onSubmitQuestion();
                }
              }}
              placeholder="Ask a question for the council to answer."
              className={props.activeSessionId ? "min-h-[92px]" : "min-h-[150px]"}
            />
          </div>
          {props.authMode === "demo" ? (
            <>
              <DemoCouncilPanel onUnlockByok={props.onRequestByokFromDemo} />
              {props.demoByokConfirmOpen ? (
                <DemoEndConfirmation
                  title="End demo session and use your key?"
                  body="The server ends the demo session before the browser cookie is cleared. Your OpenRouter key can be used after the demo session closes."
                  confirmLabel="End demo and use your key"
                  pendingLabel="Ending demo…"
                  pending={props.demoByokEnding}
                  error={props.demoByokError}
                  onCancel={props.onCancelDemoByok}
                  onConfirm={props.onConfirmDemoByok}
                />
              ) : null}
            </>
          ) : (
            <CouncilChoicePanel
              councils={props.availableCouncils}
              selectedCouncil={props.selectedCouncil}
              onSelectCouncil={props.onSelectCouncil}
            />
          )}
          <EvidencePicker
            selectedFiles={props.selectedFiles}
            onFilesSelected={props.onFilesSelected}
            onRemoveFile={props.onRemoveFile}
            onClearFiles={props.onClearFiles}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={props.submitting || !props.query.trim() || !props.canSubmitWithCouncil}
              size={props.activeSessionId ? "default" : "lg"}
            >
              {props.submitting ? "Asking…" : "Ask the council"}
            </Button>
            <span className="text-xs text-[var(--text-dim)]">
              ⌘/Ctrl+Enter asks · drafts persist locally
            </span>
          </div>
        </form>
      </section>
    </Card>
  );
}
