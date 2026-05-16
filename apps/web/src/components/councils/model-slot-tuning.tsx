"use client";

import {
  type CouncilMemberAssignment,
  type CouncilMemberTuning,
  type ReasoningEffort,
  reasoningEffortValues,
  type Verbosity,
  verbosityValues,
} from "@the-seven/contracts";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseDecimalInput,
  parseIntegerInput,
  parseUnitIntervalInput,
} from "./model-slot-tuning-helpers";

function formatEnumLabel(value: string): string {
  if (value === "xhigh") return "Extra high";
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function formatReasoningEffort(effort: ReasoningEffort | null): string {
  if (effort === null) return "Default";
  return formatEnumLabel(effort);
}

export const DEFAULT_TUNING = {
  temperature: null,
  topP: null,
  seed: null,
  verbosity: null,
  reasoningEffort: null,
  includeReasoning: null,
} as const satisfies CouncilMemberTuning;

function supportsParameter(
  supportedParameters: readonly string[] | null,
  parameter: string,
): boolean {
  return supportedParameters ? supportedParameters.includes(parameter) : false;
}

export function pruneUnsupportedTuning(
  tuning: CouncilMemberTuning,
  supportedParameters: readonly string[],
): CouncilMemberTuning {
  return {
    temperature: supportsParameter(supportedParameters, "temperature") ? tuning.temperature : null,
    topP: supportsParameter(supportedParameters, "top_p") ? tuning.topP : null,
    seed: supportsParameter(supportedParameters, "seed") ? tuning.seed : null,
    verbosity: supportsParameter(supportedParameters, "verbosity") ? tuning.verbosity : null,
    reasoningEffort: supportsParameter(supportedParameters, "reasoning")
      ? tuning.reasoningEffort
      : null,
    includeReasoning: supportsParameter(supportedParameters, "include_reasoning")
      ? tuning.includeReasoning
      : null,
  };
}

export function tuningChanged(left: CouncilMemberTuning, right: CouncilMemberTuning): boolean {
  return (
    left.temperature !== right.temperature ||
    left.topP !== right.topP ||
    left.seed !== right.seed ||
    left.verbosity !== right.verbosity ||
    left.reasoningEffort !== right.reasoningEffort ||
    left.includeReasoning !== right.includeReasoning
  );
}

/** Renders catalog-supported controls and prunes unsupported member tuning. */
export function ModelSlotTuning(props: {
  fieldId: string;
  editable: boolean;
  member: CouncilMemberAssignment;
  tuning: CouncilMemberTuning;
  supportedParameters: readonly string[] | null;
  supportedParameterCount: number | null;
  onChange: (next: CouncilMemberAssignment) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tuning-panel">
      <button
        type="button"
        className="tuning-disclosure"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>Tuning</span>
        <span>
          {props.supportedParameterCount === null
            ? "catalog pending"
            : `${props.supportedParameterCount} supported`}
        </span>
      </button>
      {open ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {supportsParameter(props.supportedParameters, "temperature") ? (
            <div className="space-y-2">
              <Label htmlFor={`${props.fieldId}-temperature`}>Temperature</Label>
              <Input
                id={`${props.fieldId}-temperature`}
                inputMode="decimal"
                disabled={!props.editable}
                value={props.tuning.temperature ?? ""}
                onChange={(event) =>
                  props.onChange({
                    ...props.member,
                    tuning: {
                      ...props.tuning,
                      temperature: parseDecimalInput(event.target.value),
                    },
                  })
                }
              />
            </div>
          ) : null}
          {supportsParameter(props.supportedParameters, "top_p") ? (
            <div className="space-y-2">
              <Label htmlFor={`${props.fieldId}-top-p`}>Top P</Label>
              <Input
                id={`${props.fieldId}-top-p`}
                inputMode="decimal"
                min={0}
                max={1}
                step="0.01"
                aria-describedby={`${props.fieldId}-top-p-help`}
                disabled={!props.editable}
                value={props.tuning.topP ?? ""}
                onChange={(event) =>
                  props.onChange({
                    ...props.member,
                    tuning: { ...props.tuning, topP: parseUnitIntervalInput(event.target.value) },
                  })
                }
              />
              <p id={`${props.fieldId}-top-p-help`} className="m-0 text-xs text-[var(--text-dim)]">
                Top P is bounded to 0 through 1 before save.
              </p>
            </div>
          ) : null}
          {supportsParameter(props.supportedParameters, "seed") ? (
            <div className="space-y-2">
              <Label htmlFor={`${props.fieldId}-seed`}>Seed</Label>
              <Input
                id={`${props.fieldId}-seed`}
                inputMode="numeric"
                disabled={!props.editable}
                value={props.tuning.seed ?? ""}
                onChange={(event) =>
                  props.onChange({
                    ...props.member,
                    tuning: { ...props.tuning, seed: parseIntegerInput(event.target.value) },
                  })
                }
              />
            </div>
          ) : null}
          {supportsParameter(props.supportedParameters, "verbosity") ? (
            <div className="space-y-2 md:col-span-2">
              <fieldset className="reasoning-choice-group">
                <legend className="docket-question-label">Verbosity</legend>
                {[null, ...verbosityValues].map((verbosity) => (
                  <label
                    key={verbosity ?? "default"}
                    className={
                      props.tuning.verbosity === verbosity
                        ? "filter-chip filter-chip-active"
                        : "filter-chip"
                    }
                  >
                    <input
                      className="choice-input"
                      type="radio"
                      name={`${props.fieldId}-verbosity`}
                      value={verbosity ?? "default"}
                      checked={props.tuning.verbosity === verbosity}
                      disabled={!props.editable}
                      onChange={(event) => {
                        if (!event.currentTarget.checked) return;
                        props.onChange({
                          ...props.member,
                          tuning: { ...props.tuning, verbosity: verbosity as Verbosity | null },
                        });
                      }}
                    />
                    {verbosity === null ? "Default" : formatEnumLabel(verbosity)}
                  </label>
                ))}
              </fieldset>
            </div>
          ) : null}
          {supportsParameter(props.supportedParameters, "reasoning") ? (
            <div className="space-y-2 md:col-span-2">
              <fieldset className="reasoning-choice-group">
                <legend className="docket-question-label">Reasoning effort</legend>
                {[null, ...reasoningEffortValues].map((effort) => (
                  <label
                    key={effort ?? "default"}
                    className={
                      props.tuning.reasoningEffort === effort
                        ? "filter-chip filter-chip-active"
                        : "filter-chip"
                    }
                  >
                    <input
                      className="choice-input"
                      type="radio"
                      name={`${props.fieldId}-reasoning-effort`}
                      value={effort ?? "default"}
                      checked={props.tuning.reasoningEffort === effort}
                      disabled={!props.editable}
                      onChange={(event) => {
                        if (!event.currentTarget.checked) return;
                        props.onChange({
                          ...props.member,
                          tuning: {
                            ...props.tuning,
                            reasoningEffort: effort as ReasoningEffort | null,
                          },
                        });
                      }}
                    />
                    {formatReasoningEffort(effort)}
                  </label>
                ))}
              </fieldset>
            </div>
          ) : null}
          {supportsParameter(props.supportedParameters, "include_reasoning") ? (
            <div className="space-y-2 md:col-span-2">
              <fieldset className="reasoning-choice-group">
                <legend className="docket-question-label">Reasoning transcript</legend>
                {[
                  { label: "Default", value: null },
                  { label: "Send", value: true },
                  { label: "Suppress", value: false },
                ].map((option) => (
                  <label
                    key={option.label}
                    className={
                      props.tuning.includeReasoning === option.value
                        ? "filter-chip filter-chip-active"
                        : "filter-chip"
                    }
                  >
                    <input
                      className="choice-input"
                      type="radio"
                      name={`${props.fieldId}-include-reasoning`}
                      value={option.label}
                      checked={props.tuning.includeReasoning === option.value}
                      disabled={!props.editable}
                      onChange={(event) => {
                        if (!event.currentTarget.checked) return;
                        props.onChange({
                          ...props.member,
                          tuning: { ...props.tuning, includeReasoning: option.value },
                        });
                      }}
                    />
                    {option.label}
                  </label>
                ))}
              </fieldset>
            </div>
          ) : null}
          {props.supportedParameterCount === 0 ? (
            <p className="m-0 text-xs text-[var(--text-dim)] md:col-span-2">
              The current catalog row exposes no editable tuning controls.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
