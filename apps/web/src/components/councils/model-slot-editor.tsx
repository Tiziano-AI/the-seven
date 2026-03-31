"use client";

import { useEffect, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { autocompleteModels } from "@/lib/api";

export type EditableCouncilMember = Readonly<{
  memberPosition: number;
  model: { provider: "openrouter"; modelId: string };
  tuning: {
    temperature: number | null;
    topP: number | null;
    seed: number | null;
    verbosity: string | null;
    reasoningEffort: string | null;
    includeReasoning: boolean | null;
  } | null;
}>;

export function ModelSlotEditor(props: {
  authHeader: string;
  member: EditableCouncilMember;
  onChange: (next: EditableCouncilMember) => void;
}) {
  const listId = useId();
  const fieldId = useId();
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
          if (!cancelled) {
            setSuggestions(result.suggestions);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
          }
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

  return (
    <div className="rounded-[24px] border border-[var(--border)] bg-white/70 p-4">
      <div className="mb-3 text-sm font-semibold">
        Member {String.fromCharCode(64 + props.member.memberPosition)}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-model`}>Model Id</Label>
        <Input
          id={`${fieldId}-model`}
          list={listId}
          value={props.member.model.modelId}
          onChange={(event) =>
            props.onChange({
              ...props.member,
              model: {
                provider: "openrouter",
                modelId: event.target.value,
              },
            })
          }
        />
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion.modelId} value={suggestion.modelId}>
              {suggestion.modelName}
            </option>
          ))}
        </datalist>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--muted-foreground)]">
          Tuning
        </summary>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-temperature`}>Temperature</Label>
            <Input
              id={`${fieldId}-temperature`}
              type="number"
              step="0.1"
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
              value={tuning.verbosity ?? ""}
              onChange={(event) =>
                props.onChange({
                  ...props.member,
                  tuning: {
                    ...tuning,
                    verbosity: event.target.value || null,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-reasoning-effort`}>Reasoning Effort</Label>
            <Input
              id={`${fieldId}-reasoning-effort`}
              value={tuning.reasoningEffort ?? ""}
              onChange={(event) =>
                props.onChange({
                  ...props.member,
                  tuning: {
                    ...tuning,
                    reasoningEffort: event.target.value || null,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`${fieldId}-include-reasoning`}>Include Reasoning</Label>
            <Textarea
              id={`${fieldId}-include-reasoning`}
              className="min-h-[70px]"
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
