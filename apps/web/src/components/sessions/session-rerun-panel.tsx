"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { fetchCouncils } from "@/lib/api";

type AvailableCouncils = Awaited<ReturnType<typeof fetchCouncils>>["councils"];

/** Renders the explicit cost-bearing run-again form for a selected run. */
export function SessionRerunPanel(props: {
  fieldPrefix: string;
  rerunQuery: string;
  rerunCouncil: string;
  availableCouncils: AvailableCouncils;
  councilLoadIssue: string | null;
  councilLoadPending: boolean;
  exhibitCount: number;
  rerunning: boolean;
  actionPending: boolean;
  actionMessage: string | null;
  onQueryChange: (value: string) => void;
  onCouncilChange: (value: string) => void;
  onRetryCouncils: () => void;
  onRerun: () => void;
}) {
  const exhibitLabel =
    props.exhibitCount === 0
      ? "no exhibits"
      : props.exhibitCount === 1
        ? "1 exhibit"
        : `${props.exhibitCount} exhibits`;
  const questionBlank = props.rerunQuery.trim().length === 0;
  return (
    <Card className="p-6">
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          props.onRerun();
        }}
      >
        <p className="m-0 text-sm leading-6 text-[var(--text-muted)] md:col-span-2">
          Run again creates a new saved run and keeps the original answer unchanged. It reuses{" "}
          {exhibitLabel} from the original question. The original council is selected when
          available; choose another council only if you want to change who answers.
        </p>
        <div className="space-y-2">
          <Label htmlFor={`${props.fieldPrefix}-rerun-query`}>Question for this run</Label>
          <Textarea
            id={`${props.fieldPrefix}-rerun-query`}
            value={props.rerunQuery}
            disabled={props.actionPending}
            onChange={(event) => props.onQueryChange(event.target.value)}
          />
          {questionBlank ? (
            <p className="m-0 text-xs text-[var(--text-dim)]">
              A blank question reuses the original question.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          {props.councilLoadIssue ? (
            <div className="panel p-3" role="alert">
              <p className="m-0 text-sm font-semibold text-[var(--text)]">
                Council settings could not load.
              </p>
              <p className="m-0 mt-1 text-xs text-[var(--text-dim)]">{props.councilLoadIssue}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={props.onRetryCouncils}
                disabled={props.actionPending || props.councilLoadPending}
              >
                {props.councilLoadPending ? "Retrying…" : "Retry council settings"}
              </Button>
            </div>
          ) : null}
          <fieldset className="choice-grid">
            <legend className="docket-question-label" id={`${props.fieldPrefix}-rerun-council`}>
              Council
            </legend>
            {props.availableCouncils.map((council) => {
              const value =
                council.ref.kind === "built_in"
                  ? `built_in:${council.ref.slug}`
                  : `user:${council.ref.councilId}`;
              return (
                <label
                  key={value}
                  className={
                    props.rerunCouncil === value ? "filter-chip filter-chip-active" : "filter-chip"
                  }
                >
                  <input
                    className="choice-input"
                    type="radio"
                    name={`${props.fieldPrefix}-rerun-council-choice`}
                    value={value}
                    checked={props.rerunCouncil === value}
                    disabled={props.actionPending}
                    onChange={(event) => {
                      if (event.currentTarget.checked) props.onCouncilChange(value);
                    }}
                  />
                  {council.name}
                </label>
              );
            })}
          </fieldset>
          {!props.rerunCouncil ? (
            <p className="m-0 text-xs text-[var(--text-dim)]">
              {props.councilLoadPending
                ? "Loading councils before you can run again."
                : "Choose a council before running again."}
            </p>
          ) : null}
        </div>
        <div className="md:col-span-2">
          <Button
            type="submit"
            disabled={props.actionPending || props.councilLoadPending || !props.rerunCouncil}
          >
            {props.rerunning ? "Creating new run…" : "Run again"}
          </Button>
          {props.actionMessage ? (
            <p role="status" className="m-0 mt-2 text-sm text-[var(--text-muted)]">
              {props.actionMessage}
            </p>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
