"use client";

import {
  ATTACHMENT_FILE_EXTENSIONS,
  FILE_INPUT_ACCEPT,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENT_DECODED_BYTES,
  MAX_ATTACHMENT_EXTRACTED_CHARS,
} from "@the-seven/contracts";
import Link from "next/link";
import { type DragEvent, useRef, useState } from "react";
import {
  type EvidenceSelectionIssue,
  validateEvidenceSelection,
} from "@/components/screens/home-evidence-selection";
import { formatFileSize } from "@/components/screens/home-screen-formatters";
import { Button } from "@/components/ui/button";
import type { fetchCouncils } from "@/lib/api";

type CouncilListItem = Awaited<ReturnType<typeof fetchCouncils>>["councils"][number];

function councilOptionValue(council: CouncilListItem): string {
  return council.ref.kind === "built_in"
    ? `built_in:${council.ref.slug}`
    : `user:${council.ref.councilId}`;
}

function councilTierLine(council: CouncilListItem): string {
  if (council.ref.kind !== "built_in") return "Custom council";
  if (council.ref.slug === "founding") {
    return "Strongest built-in council for serious questions";
  }
  if (council.ref.slug === "lantern") {
    return "Balanced council for everyday questions";
  }
  return "Low-cost council used by the demo";
}

/** Renders the durable receipt after a demo-link request leaves the browser. */
export function DemoRequestReceipt(props: { email: string }) {
  return (
    <div id="demo-request-receipt" className="panel demo-receipt" role="status">
      <p className="m-0 font-semibold">Check your inbox</p>
      <p className="m-0 mt-1 text-sm leading-6 text-[var(--text-muted)]">
        The demo link was sent to {props.email}. It opens a 24-hour Commons demo in the browser
        where you open the email link. If it does not arrive, resend the link or bring your own
        OpenRouter key.
      </p>
    </div>
  );
}

/** Explains the single Commons-only demo council boundary before asking. */
export function DemoCouncilPanel(props: { onUnlockByok: () => void }) {
  return (
    <div className="space-y-2">
      <p className="docket-question-label">Council</p>
      <div className="panel py-3">
        <span className="seal">Commons Council</span>
        <p className="m-0 mt-2 text-sm text-[var(--text-dim)]">
          Demo questions use Commons. Use your OpenRouter key to choose or edit other councils.
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={props.onUnlockByok}>
          End demo and use your key
        </Button>
      </div>
    </div>
  );
}

/** Renders BYOK council selection with the current tier and proof context. */
export function CouncilChoicePanel(props: {
  councils: CouncilListItem[];
  selectedCouncil: string;
  onSelectCouncil: (value: string) => void;
}) {
  const selectedCouncil = props.councils.find((council) => {
    return councilOptionValue(council) === props.selectedCouncil;
  });

  return (
    <div className="space-y-2">
      <fieldset className="choice-grid">
        <legend className="docket-question-label" id="matter-council">
          Council
        </legend>
        {props.councils.map((council) => {
          const value = councilOptionValue(council);
          const selected = props.selectedCouncil === value;
          return (
            <label
              key={value}
              className={selected ? "filter-chip filter-chip-active" : "filter-chip"}
            >
              <input
                className="choice-input"
                type="radio"
                name="matter-council"
                value={value}
                checked={selected}
                onChange={(event) => {
                  if (event.currentTarget.checked) props.onSelectCouncil(value);
                }}
              />
              <span>{council.name}</span>
            </label>
          );
        })}
      </fieldset>
      {selectedCouncil ? (
        <div className="panel py-3">
          <p className="m-0 text-sm font-semibold text-[var(--text)]">
            {councilTierLine(selectedCouncil)}
          </p>
          {selectedCouncil.description ? (
            <p className="m-0 mt-1 text-sm text-[var(--text-dim)]">{selectedCouncil.description}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="m-0 text-xs text-[var(--text-dim)]">
              Seven seats: six reviewers and one final-answer writer.
            </p>
            <Link className="text-link text-sm" href="/councils">
              Manage councils
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Owns the optional file picker and selected-file presentation. */
export function EvidencePicker(props: {
  selectedFiles: File[];
  onFilesSelected: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [evidenceIssues, setEvidenceIssues] = useState<EvidenceSelectionIssue[]>([]);

  function addFiles(files: File[]) {
    const result = validateEvidenceSelection(props.selectedFiles, files);
    setEvidenceIssues(result.issues);
    props.onFilesSelected(result.files);
  }

  function selectDroppedFiles(event: DragEvent<HTMLFieldSetElement>) {
    event.preventDefault();
    setDragActive(false);
    addFiles(Array.from(event.dataTransfer.files));
  }

  function selectInputFiles(files: File[]) {
    addFiles(files);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <fieldset
        className={dragActive ? "evidence-dropzone evidence-dropzone-active" : "evidence-dropzone"}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          const relatedTarget = event.relatedTarget;
          if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) return;
          setDragActive(false);
        }}
        onDrop={selectDroppedFiles}
      >
        <legend className="docket-question-label">Optional files</legend>
        <input
          ref={inputRef}
          id="matter-attachments"
          className="evidence-input"
          type="file"
          multiple
          accept={FILE_INPUT_ACCEPT}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(event) => selectInputFiles(Array.from(event.target.files ?? []))}
        />
        <button
          type="button"
          className="evidence-trigger"
          aria-describedby="evidence-helper evidence-limits"
          onClick={() => inputRef.current?.click()}
        >
          Choose or drop files
        </button>
        <p id="evidence-helper" className="m-0 text-sm text-[var(--text-dim)]">
          Attach source files for the council to read.
        </p>
        <p id="evidence-limits" className="m-0 text-xs text-[var(--text-dim)]">
          Up to {MAX_ATTACHMENT_COUNT} exhibits · {formatFileSize(MAX_ATTACHMENT_DECODED_BYTES)}{" "}
          decoded each · {MAX_ATTACHMENT_EXTRACTED_CHARS.toLocaleString("en-US")} extracted chars ·{" "}
          {ATTACHMENT_FILE_EXTENSIONS.join(", ")}
        </p>
      </fieldset>
      {evidenceIssues.length > 0 ? (
        <div className="alert-danger" role="alert">
          <p className="m-0 text-sm font-semibold">Some exhibits were not added.</p>
          <ul className="m-0 mt-2 space-y-1 pl-4 text-xs">
            {evidenceIssues.map((issue) => (
              <li key={`${issue.fileName}-${issue.message}`}>
                {issue.fileName}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {props.selectedFiles.length > 0 ? (
        <div className="evidence-ledger">
          <div className="evidence-ledger-head">
            <p className="m-0 text-xs text-[var(--text-dim)]">
              {props.selectedFiles.length} selected file
              {props.selectedFiles.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              className="evidence-clear"
              onClick={() => {
                setEvidenceIssues([]);
                props.onClearFiles();
              }}
            >
              Clear files
            </button>
          </div>
          <ul className="evidence-list" aria-label="Selected evidence">
            {props.selectedFiles.map((file, index) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`} className="evidence-item">
                <span className="evidence-name">
                  File {index + 1}: {file.name}
                </span>
                <span>{formatFileSize(file.size)}</span>
                <button
                  type="button"
                  className="evidence-remove"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => {
                    setEvidenceIssues([]);
                    props.onRemoveFile(index);
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Marks the composer as ready for another question after one is submitted. */
export function AskAnotherQuestionPanel(props: {
  canReuseLastQuestion: boolean;
  onReuseLastQuestion: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="panel confirm-panel">
      <div>
        <p className="m-0 font-semibold">Ready for another question</p>
        <p className="m-0 mt-1 text-sm text-[var(--text-dim)]">
          The submitted run stays above. The box below is ready for a new question.
        </p>
      </div>
      {props.canReuseLastQuestion ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={props.onReuseLastQuestion}>
            Reuse last question
          </Button>
          <Button variant="ghost" size="sm" onClick={props.onDismiss}>
            Hide for now
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" onClick={props.onDismiss}>
          Hide for now
        </Button>
      )}
    </div>
  );
}
