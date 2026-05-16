"use client";

import {
  type CouncilMemberAssignment,
  isMemberPosition,
  memberForPosition,
} from "@the-seven/contracts";
import { useEffect, useId, useRef, useState } from "react";
import { Sigil } from "@/components/app/sigil";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { autocompleteModels, validateModel } from "@/lib/api";
import { readableModelLabel } from "@/lib/model-labels";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TUNING,
  ModelSlotTuning,
  pruneUnsupportedTuning,
  tuningChanged,
} from "./model-slot-tuning";

export type EditableCouncilMember = CouncilMemberAssignment;

type ModelSuggestion = Awaited<ReturnType<typeof autocompleteModels>>["suggestions"][number];
type ModelValidation = Awaited<ReturnType<typeof validateModel>>;
type ModelValidationState =
  | Readonly<{ status: "idle" | "loading" }>
  | Readonly<{ status: "valid"; model: NonNullable<ModelValidation["model"]> }>
  | Readonly<{ status: "invalid" | "error"; message: string }>;

function selectedModelName(modelId: string, suggestions: readonly ModelSuggestion[]): string {
  return (
    suggestions.find((suggestion) => suggestion.modelId === modelId)?.modelName ??
    readableModelLabel(modelId)
  );
}

export function ModelSlotEditor(props: {
  authHeader: string;
  member: EditableCouncilMember;
  editable?: boolean;
  onChange: (next: EditableCouncilMember) => void;
  onAuthorityDenial?: (error: unknown) => boolean;
  onValidityChange?: (memberPosition: number, valid: boolean) => void;
}) {
  const fieldId = useId();
  const pickerRootRef = useRef<HTMLDivElement | null>(null);
  const editable = props.editable ?? true;
  const [suggestions, setSuggestions] = useState<ModelSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [catalogPickerActive, setCatalogPickerActive] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [modelValidation, setModelValidation] = useState<ModelValidationState>({ status: "idle" });
  const [manualEditOpen, setManualEditOpen] = useState(false);

  useEffect(() => {
    const query = modelQuery.trim();
    if (!catalogPickerActive || !query) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      void autocompleteModels(props.authHeader, query, 6)
        .then((result) => {
          if (!cancelled) {
            setSuggestions(result.suggestions);
            setSuggestionsOpen(catalogPickerActive && result.suggestions.length > 0);
            setActiveSuggestionIndex(0);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            if (props.onAuthorityDenial?.(error)) {
              return;
            }
            setSuggestions([]);
            setSuggestionsOpen(false);
          }
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [catalogPickerActive, modelQuery, props.authHeader, props.onAuthorityDenial]);

  const tuning = props.member.tuning ?? DEFAULT_TUNING;

  useEffect(() => {
    const modelId = props.member.model.modelId.trim();
    if (!modelId) {
      setModelValidation({ status: "invalid", message: "Enter a model slug." });
      props.onValidityChange?.(props.member.memberPosition, false);
      return;
    }

    let cancelled = false;
    setModelValidation({ status: "loading" });
    const timeout = setTimeout(() => {
      void validateModel(props.authHeader, modelId)
        .then((result) => {
          if (cancelled) return;
          if (!result.valid || !result.model) {
            setModelValidation({ status: "invalid", message: "Not found in the current catalog." });
            props.onValidityChange?.(props.member.memberPosition, false);
            return;
          }

          setModelValidation({ status: "valid", model: result.model });
          props.onValidityChange?.(props.member.memberPosition, true);
          if (editable) {
            const currentTuning = props.member.tuning ?? DEFAULT_TUNING;
            const pruned = pruneUnsupportedTuning(currentTuning, result.model.supportedParameters);
            if (tuningChanged(currentTuning, pruned)) {
              props.onChange({ ...props.member, tuning: pruned });
            }
          }
        })
        .catch((error) => {
          if (!cancelled) {
            if (props.onAuthorityDenial?.(error)) {
              return;
            }
            setModelValidation({ status: "error", message: "Catalog validation is unavailable." });
            props.onValidityChange?.(props.member.memberPosition, false);
          }
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [
    editable,
    props.authHeader,
    props.member,
    props.onAuthorityDenial,
    props.onChange,
    props.onValidityChange,
  ]);

  const position = isMemberPosition(props.member.memberPosition)
    ? props.member.memberPosition
    : null;
  const seven = position ? memberForPosition(position) : null;
  const role = seven?.role ?? "reviewer";
  const alias = seven?.alias ?? String.fromCharCode(64 + props.member.memberPosition);
  const supportedParameters =
    modelValidation.status === "valid" ? modelValidation.model.supportedParameters : null;
  const selectedModel =
    modelValidation.status === "valid"
      ? modelValidation.model.modelName
      : selectedModelName(props.member.model.modelId, suggestions);

  const updateModelId = (modelId: string) => {
    props.onChange({
      ...props.member,
      model: { provider: "openrouter", modelId },
    });
  };

  const selectSuggestion = (suggestion: ModelSuggestion) => {
    updateModelId(suggestion.modelId);
    setCatalogPickerActive(false);
    setModelQuery("");
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
  };

  const exactModelCandidate = modelQuery.trim();
  const exactModelCandidateAvailable = exactModelCandidate.includes("/");

  const applyExactModelCandidate = () => {
    if (!exactModelCandidateAvailable) {
      return;
    }
    updateModelId(exactModelCandidate);
    setCatalogPickerActive(false);
    setModelQuery("");
    setSuggestionsOpen(false);
    setActiveSuggestionIndex(0);
  };

  const activeSuggestion = suggestions[activeSuggestionIndex] ?? null;
  const listboxId = `${fieldId}-suggestions`;
  const manualEditId = `${fieldId}-manual-provider-id`;
  const suggestionsLedgerOpen =
    catalogPickerActive &&
    (suggestionsOpen || exactModelCandidateAvailable) &&
    (suggestions.length > 0 || exactModelCandidateAvailable);
  const activeOptionId =
    suggestionsOpen && activeSuggestion
      ? `${fieldId}-suggestion-${activeSuggestionIndex}`
      : undefined;

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
        <span className="role-card-role" title={`member position ${props.member.memberPosition}`}>
          Seat {alias}
        </span>
      </div>

      <div className="space-y-2" ref={pickerRootRef}>
        <p className="docket-question-label">Model</p>
        <div className="model-selection-plate" aria-live="polite">
          <span className="model-selection-name">{selectedModel}</span>
          <span className="model-selection-id">{props.member.model.modelId}</span>
        </div>
        {editable ? (
          <button
            type="button"
            className="model-picker-toggle"
            data-seat-model-control={alias}
            aria-label={`${catalogPickerActive ? "Close" : "Change"} Seat ${alias} model catalog`}
            aria-expanded={catalogPickerActive}
            onClick={() => {
              setCatalogPickerActive((current) => {
                if (current) {
                  setModelQuery("");
                }
                return !current;
              });
              setSuggestionsOpen(false);
              setActiveSuggestionIndex(0);
            }}
          >
            {catalogPickerActive ? "Close catalog" : "Change model"}
          </button>
        ) : null}
        {catalogPickerActive ? (
          <div className="model-picker-panel">
            <Label htmlFor={`${fieldId}-model`}>Catalog search</Label>
            <Input
              id={`${fieldId}-model`}
              aria-label={`Search Seat ${alias} catalog`}
              value={modelQuery}
              disabled={!editable}
              onChange={(event) => {
                setModelQuery(event.target.value);
                setSuggestionsOpen(false);
                setActiveSuggestionIndex(0);
              }}
              onFocus={() => {
                setSuggestionsOpen(suggestions.length > 0);
                setActiveSuggestionIndex(0);
              }}
              onBlur={() => {
                window.setTimeout(() => {
                  const root = pickerRootRef.current;
                  if (root?.contains(document.activeElement)) {
                    return;
                  }
                  setCatalogPickerActive(false);
                  setSuggestionsOpen(false);
                }, 0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSuggestionsOpen(false);
                  setActiveSuggestionIndex(0);
                  return;
                }
                if (event.key === "Enter" && exactModelCandidateAvailable) {
                  event.preventDefault();
                  applyExactModelCandidate();
                  return;
                }
                if (event.key === "Enter" && suggestionsOpen && activeSuggestion) {
                  event.preventDefault();
                  selectSuggestion(activeSuggestion);
                  return;
                }
                if (suggestions.length === 0) {
                  return;
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setSuggestionsOpen(true);
                  setActiveSuggestionIndex((current) =>
                    current >= suggestions.length - 1 ? 0 : current + 1,
                  );
                  return;
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setSuggestionsOpen(true);
                  setActiveSuggestionIndex((current) =>
                    current <= 0 ? suggestions.length - 1 : current - 1,
                  );
                }
              }}
              placeholder="Search OpenRouter catalog"
              aria-describedby={`${fieldId}-model-evidence`}
              aria-autocomplete="list"
              aria-controls={suggestionsLedgerOpen ? listboxId : undefined}
              aria-expanded={suggestionsLedgerOpen}
              aria-activedescendant={activeOptionId}
              role="combobox"
            />
          </div>
        ) : null}
        <p id={`${fieldId}-model-evidence`} className="m-0 text-xs text-[var(--text-dim)]">
          Catalog suggestions are selected below; current catalog validation gates save/run safety.
        </p>
        <p
          className={cn(
            "m-0 text-xs",
            modelValidation.status === "invalid" || modelValidation.status === "error"
              ? "model-validation-error"
              : "text-[var(--text-dim)]",
          )}
        >
          {modelValidation.status === "loading"
            ? "Validating catalog row…"
            : modelValidation.status === "valid"
              ? `${modelValidation.model.supportedParameters.length} supported parameters · ${
                  modelValidation.model.expirationDate ?? "no expiration listed"
                }`
              : modelValidation.status === "invalid" || modelValidation.status === "error"
                ? modelValidation.message
                : "Catalog status pending."}
        </p>
        {suggestionsLedgerOpen ? (
          <div
            id={listboxId}
            className="model-suggestion-ledger"
            role="listbox"
            aria-label={`${alias} model suggestions`}
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.modelId}
                id={`${fieldId}-suggestion-${index}`}
                type="button"
                className={cn(
                  "model-suggestion-row",
                  index === activeSuggestionIndex && "model-suggestion-row-active",
                )}
                role="option"
                aria-selected={index === activeSuggestionIndex}
                disabled={!editable}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveSuggestionIndex(index)}
                onClick={() => selectSuggestion(suggestion)}
              >
                <span className="model-suggestion-name">{suggestion.modelName}</span>
                <span className="model-suggestion-id">{suggestion.modelId}</span>
              </button>
            ))}
            {exactModelCandidateAvailable ? (
              <button
                type="button"
                className="model-suggestion-row model-exact-row"
                onMouseDown={(event) => event.preventDefault()}
                onClick={applyExactModelCandidate}
              >
                <span className="model-suggestion-name">Use exact provider ID</span>
                <span className="model-suggestion-id">{exactModelCandidate}</span>
              </button>
            ) : null}
          </div>
        ) : null}
        {editable ? (
          <div className="model-manual-edit">
            <button
              type="button"
              className="model-manual-edit-toggle"
              aria-expanded={manualEditOpen}
              aria-controls={manualEditId}
              onClick={() => setManualEditOpen((open) => !open)}
            >
              {manualEditOpen ? "Hide exact provider ID" : "Use exact provider ID"}
            </button>
            <div
              id={manualEditId}
              className="model-manual-edit-panel mt-2 space-y-2"
              hidden={!manualEditOpen}
            >
              <Label htmlFor={`${fieldId}-model-id`}>Provider ID</Label>
              <Input
                id={`${fieldId}-model-id`}
                className="model-id-input"
                aria-label={`Seat ${alias} provider ID`}
                data-seat-model-input={alias}
                value={props.member.model.modelId}
                disabled={!editable}
                onChange={(event) => {
                  updateModelId(event.target.value);
                  setSuggestionsOpen(false);
                  setActiveSuggestionIndex(0);
                }}
                placeholder="provider/model-slug"
              />
            </div>
          </div>
        ) : null}
      </div>

      <ModelSlotTuning
        fieldId={fieldId}
        editable={editable}
        member={props.member}
        tuning={tuning}
        supportedParameters={supportedParameters}
        supportedParameterCount={
          modelValidation.status === "valid"
            ? modelValidation.model.supportedParameters.length
            : null
        }
        onChange={props.onChange}
      />
    </div>
  );
}
