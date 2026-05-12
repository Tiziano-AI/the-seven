"use client";

import {
  type CouncilMemberAssignment,
  isMemberPosition,
  memberForPosition,
} from "@the-seven/contracts";
import { useEffect, useId, useState } from "react";
import { Sigil } from "@/components/app/sigil";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { autocompleteModels } from "@/lib/api";
import { cn } from "@/lib/utils";

export type EditableCouncilMember = CouncilMemberAssignment;

export function ModelSlotEditor(props: {
  authHeader: string;
  member: EditableCouncilMember;
  editable?: boolean;
  onChange: (next: EditableCouncilMember) => void;
}) {
  const listId = useId();
  const fieldId = useId();
  const editable = props.editable ?? true;
  const [suggestions, setSuggestions] = useState<
    Awaited<ReturnType<typeof autocompleteModels>>["suggestions"]
  >([]);

  useEffect(() => {
    if (!props.member.model.modelId.trim()) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void autocompleteModels(props.authHeader, props.member.model.modelId, 6)
        .then((result) => {
          if (!cancelled) setSuggestions(result.suggestions);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [props.authHeader, props.member.model.modelId]);

  const tuning = props.member.tuning ?? {
    temperature: 1,
    topP: 1,
    seed: null,
    verbosity: null,
    reasoningEffort: "xhigh",
    includeReasoning: null,
  };

  const position = isMemberPosition(props.member.memberPosition)
    ? props.member.memberPosition
    : null;
  const seven = position ? memberForPosition(position) : null;
  const role = seven?.role ?? "reviewer";
  const alias = seven?.alias ?? String.fromCharCode(64 + props.member.memberPosition);

  return (
    <div className={cn("panel role-card", role === "synthesizer" && "role-card-synth")}>
      <div className="role-card-head">
        {position ? <Sigil position={position} className="role-card-sigil" /> : null}
        <div>
          <div className="role-card-id">{alias}</div>
          <div className="text-xs text-[var(--text-dim)]">
            {role === "synthesizer"
              ? "Synthesizer · final verdict"
              : "Reviewer · drafts and critiques"}
          </div>
        </div>
        <span className="role-card-role">M{props.member.memberPosition}</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-model`}>Model id</Label>
        <Input
          id={`${fieldId}-model`}
          list={listId}
          value={props.member.model.modelId}
          disabled={!editable}
          onChange={(event) =>
            props.onChange({
              ...props.member,
              model: { provider: "openrouter", modelId: event.target.value },
            })
          }
          placeholder="provider/model-slug"
        />
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion.modelId} value={suggestion.modelId}>
              {suggestion.modelName}
            </option>
          ))}
        </datalist>
      </div>

      <details>
        <summary className="cursor-pointer text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
          Tuning
        </summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-temperature`}>Temperature</Label>
            <Input
              id={`${fieldId}-temperature`}
              type="number"
              step="0.1"
              disabled={!editable}
              value={tuning.temperature ?? ""}
              onChange={(event) =>
                props.onChange({
                  ...props.member,
                  tuning: {
                    ...tuning,
                    temperature: event.target.value ? Number(event.target.value) : null,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-seed`}>Seed</Label>
            <Input
              id={`${fieldId}-seed`}
              type="number"
              disabled={!editable}
              value={tuning.seed ?? ""}
              onChange={(event) =>
                props.onChange({
                  ...props.member,
                  tuning: {
                    ...tuning,
                    seed: event.target.value ? Number.parseInt(event.target.value, 10) : null,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-verbosity`}>Verbosity</Label>
            <Input
              id={`${fieldId}-verbosity`}
              disabled={!editable}
              value={tuning.verbosity ?? ""}
              onChange={(event) =>
                props.onChange({
                  ...props.member,
                  tuning: { ...tuning, verbosity: event.target.value || null },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-reasoning-effort`}>Reasoning effort</Label>
            <Input
              id={`${fieldId}-reasoning-effort`}
              disabled={!editable}
              value={tuning.reasoningEffort ?? ""}
              onChange={(event) =>
                props.onChange({
                  ...props.member,
                  tuning: { ...tuning, reasoningEffort: event.target.value || null },
                })
              }
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`${fieldId}-include-reasoning`}>Include reasoning</Label>
            <Textarea
              id={`${fieldId}-include-reasoning`}
              className="min-h-[60px]"
              disabled={!editable}
              value={
                tuning.includeReasoning === null ? "" : tuning.includeReasoning ? "true" : "false"
              }
              onChange={(event) =>
                props.onChange({
                  ...props.member,
                  tuning: {
                    ...tuning,
                    includeReasoning:
                      event.target.value.trim() === ""
                        ? null
                        : event.target.value.trim().toLowerCase() === "true",
                  },
                })
              }
              placeholder="true, false, or blank"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
