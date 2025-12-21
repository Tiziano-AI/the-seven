import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { CouncilMemberTuning } from "@shared/domain/councilMemberTuning";
import { isSingleLine } from "@shared/domain/strings";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const VERBOSITY_PRESETS = ["low", "medium", "high"];
const REASONING_EFFORT_PRESETS = ["none", "minimal", "low", "medium", "high", "xhigh"];

type SelectValueId = "auto" | "custom" | (string & {});

function presetOrCustom(value: string | null, presets: ReadonlyArray<string>): SelectValueId {
  if (value === null) return "auto";
  return presets.includes(value) ? value : "custom";
}

export function ModelTuningPanel(props: {
  supportedParameters: ReadonlyArray<string>;
  tuning: CouncilMemberTuning;
  onTuningChange: (tuning: CouncilMemberTuning) => void;
  disabled?: boolean;
}) {
  const disabled = props.disabled ?? false;
  const [open, setOpen] = useState(false);

  const modelAdvertisesParameters = props.supportedParameters.length > 0;
  const supports = (parameter: string) => props.supportedParameters.includes(parameter);

  const canShowTemperature = supports("temperature");
  const canShowSeed = supports("seed");
  const canShowVerbosity = supports("verbosity");
  const canShowReasoningEffort = supports("reasoning");
  const canShowIncludeReasoning = supports("include_reasoning");

  const unsupportedTuningParameters: string[] = [];
  if (props.tuning.temperature !== null && !supports("temperature")) unsupportedTuningParameters.push("temperature");
  if (props.tuning.seed !== null && !supports("seed")) unsupportedTuningParameters.push("seed");
  if (props.tuning.verbosity !== null && !supports("verbosity")) unsupportedTuningParameters.push("verbosity");
  if (props.tuning.reasoningEffort !== null && !supports("reasoning")) unsupportedTuningParameters.push("reasoning");
  if (props.tuning.includeReasoning !== null && !supports("include_reasoning")) {
    unsupportedTuningParameters.push("include_reasoning");
  }

  const verbosityMode = presetOrCustom(props.tuning.verbosity, VERBOSITY_PRESETS);
  const reasoningEffortMode = presetOrCustom(props.tuning.reasoningEffort, REASONING_EFFORT_PRESETS);

  const setTuning = (next: Partial<CouncilMemberTuning>) => {
    props.onTuningChange({ ...props.tuning, ...next });
  };

  const resetTuning = () => {
    props.onTuningChange({
      temperature: null,
      seed: null,
      verbosity: null,
      reasoningEffort: null,
      includeReasoning: null,
    });
  };

  return (
    <div className="mt-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            Tuning <span className="text-muted-foreground">(per member)</span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2">
          <div className="rounded-lg border border-border/60 bg-card/40 p-3">
            {modelAdvertisesParameters ? (
              <p className="text-xs text-muted-foreground">
                Tuning controls shown below are available for this model.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                This model does not advertise tuning parameters.
              </p>
            )}

            {unsupportedTuningParameters.length > 0 && (
              <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-2">
                <p className="text-xs text-destructive">
                  This member has stored tuning values that are not advertised for the selected model:{" "}
                  <span className="font-mono">{unsupportedTuningParameters.join(", ")}</span>.
                </p>
                <div className="mt-2">
                  <button
                    type="button"
                    className="text-xs underline text-destructive hover:text-destructive/80"
                    onClick={resetTuning}
                    disabled={disabled}
                  >
                    Clear tuning (reset to Auto)
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {canShowTemperature && (
                <div className="space-y-1">
                  <Label className="text-xs">Temperature</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="Auto"
                    value={props.tuning.temperature === null ? "" : String(props.tuning.temperature)}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw.length === 0) {
                        setTuning({ temperature: null });
                        return;
                      }
                      const parsed = Number(raw);
                      setTuning({
                        temperature: Number.isFinite(parsed) ? parsed : props.tuning.temperature,
                      });
                    }}
                    disabled={disabled}
                    className="control-compact"
                  />
                </div>
              )}

              {canShowSeed && (
                <div className="space-y-1">
                  <Label className="text-xs">Seed</Label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    step={1}
                    placeholder="Auto"
                    value={props.tuning.seed === null ? "" : String(props.tuning.seed)}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      if (raw.length === 0) {
                        setTuning({ seed: null });
                        return;
                      }
                      const parsed = Number(raw);
                      setTuning({ seed: Number.isFinite(parsed) ? parsed : props.tuning.seed });
                    }}
                    disabled={disabled}
                    className="control-compact"
                  />
                </div>
              )}

              {canShowVerbosity && (
                <div className="space-y-1">
                  <Label className="text-xs">Verbosity</Label>
                  <Select
                    value={verbosityMode}
                    onValueChange={(next) => {
                      if (next === "auto") {
                        setTuning({ verbosity: null });
                        return;
                      }
                      if (next === "custom") {
                        const keep =
                          props.tuning.verbosity && !VERBOSITY_PRESETS.includes(props.tuning.verbosity)
                            ? props.tuning.verbosity
                            : "";
                        setTuning({ verbosity: keep });
                        return;
                      }
                      setTuning({ verbosity: next });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      {VERBOSITY_PRESETS.map((preset) => (
                        <SelectItem key={preset} value={preset}>
                          {preset}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom…</SelectItem>
                    </SelectContent>
                  </Select>

                  {verbosityMode === "custom" && (
                    <Input
                      placeholder="Enter a single-line value"
                      value={props.tuning.verbosity ?? ""}
                      onChange={(e) => setTuning({ verbosity: e.target.value })}
                      disabled={disabled}
                      className="control-compact mt-1"
                    />
                  )}

                  {props.tuning.verbosity !== null && !isSingleLine(props.tuning.verbosity) && (
                    <p className="text-xs text-destructive">Verbosity must be single-line.</p>
                  )}
                </div>
              )}

              {canShowReasoningEffort && (
                <div className="space-y-1">
                  <Label className="text-xs">Reasoning effort</Label>
                  <Select
                    value={reasoningEffortMode}
                    onValueChange={(next) => {
                      if (next === "auto") {
                        setTuning({ reasoningEffort: null });
                        return;
                      }
                      if (next === "custom") {
                        const keep =
                          props.tuning.reasoningEffort &&
                          !REASONING_EFFORT_PRESETS.includes(props.tuning.reasoningEffort)
                            ? props.tuning.reasoningEffort
                            : "";
                        setTuning({ reasoningEffort: keep });
                        return;
                      }
                      setTuning({ reasoningEffort: next });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      {REASONING_EFFORT_PRESETS.map((preset) => (
                        <SelectItem key={preset} value={preset}>
                          {preset}
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Custom…</SelectItem>
                    </SelectContent>
                  </Select>

                  {reasoningEffortMode === "custom" && (
                    <Input
                      placeholder="Enter a single-line value"
                      value={props.tuning.reasoningEffort ?? ""}
                      onChange={(e) => setTuning({ reasoningEffort: e.target.value })}
                      disabled={disabled}
                      className="control-compact mt-1"
                    />
                  )}
                </div>
              )}

              {canShowIncludeReasoning && (
                <div className="space-y-1">
                  <Label className="text-xs">Include reasoning</Label>
                  <Select
                    value={
                      props.tuning.includeReasoning === null
                        ? "auto"
                        : props.tuning.includeReasoning
                          ? "include"
                          : "hide"
                    }
                    onValueChange={(next) => {
                      if (next === "auto") {
                        setTuning({ includeReasoning: null });
                        return;
                      }
                      setTuning({ includeReasoning: next === "include" });
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="include">Include</SelectItem>
                      <SelectItem value="hide">Hide</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
