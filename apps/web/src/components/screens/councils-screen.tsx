"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/app/auth-provider";
import {
  type EditableCouncilMember,
  ModelSlotEditor,
} from "@/components/councils/model-slot-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteCouncil,
  duplicateCouncil,
  fetchCouncil,
  fetchCouncils,
  fetchOutputFormats,
  updateCouncil,
} from "@/lib/api";
import { FOUNDING_COUNCIL_CHOICE, writeLastCouncilRef } from "@/lib/storage";
import { CouncilDemoNotice, CouncilLockedNotice } from "./councils-screen-notices";

function encodeRef(ref: { kind: "built_in"; slug: string } | { kind: "user"; councilId: number }) {
  return ref.kind === "built_in" ? `built_in:${ref.slug}` : `user:${ref.councilId}`;
}

export function CouncilsScreen() {
  const auth = useAuth();
  const fieldPrefix = useId();
  const [councils, setCouncils] = useState<Awaited<ReturnType<typeof fetchCouncils>>["councils"]>(
    [],
  );
  const [selectedRef, setSelectedRef] = useState("");
  const [duplicateName, setDuplicateName] = useState("");
  const [name, setName] = useState("");
  const [phasePrompts, setPhasePrompts] = useState({ phase1: "", phase2: "", phase3: "" });
  const [outputFormats, setOutputFormats] = useState({ phase1: "", phase2: "", phase3: "" });
  const [members, setMembers] = useState<EditableCouncilMember[]>([]);
  const [seatValidity, setSeatValidity] = useState<Record<number, boolean>>({});
  const [editable, setEditable] = useState(false);
  const [deletable, setDeletable] = useState(false);
  const [duplicateNameEdited, setDuplicateNameEdited] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [demoByokConfirmOpen, setDemoByokConfirmOpen] = useState(false);
  const [demoByokEnding, setDemoByokEnding] = useState(false);
  const [demoByokError, setDemoByokError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.mode !== "byok" || !auth.authHeader) {
      return;
    }

    void Promise.all([fetchCouncils(auth.authHeader), fetchOutputFormats(auth.authHeader)])
      .then(([councilList, formats]) => {
        setCouncils(councilList.councils);
        setOutputFormats(formats.outputFormats);
        if (councilList.councils[0]) {
          setSelectedRef(encodeRef(councilList.councils[0].ref));
        }
      })
      .catch((error) => {
        if (auth.handleAuthorityDenial(error)) {
          return;
        }
        toast.error(error instanceof Error ? error.message : "Failed to load councils");
      });
  }, [auth]);

  useEffect(() => {
    if (!auth.authHeader || !selectedRef) {
      return;
    }

    const selected = councils.find((council) => encodeRef(council.ref) === selectedRef);
    if (!selected) {
      return;
    }

    void fetchCouncil(auth.authHeader, selected.ref)
      .then((detail) => {
        setName(detail.name);
        setPhasePrompts(detail.phasePrompts);
        setMembers(detail.members);
        setSeatValidity({});
        setEditable(detail.editable);
        setDeletable(detail.deletable);
        if (!duplicateNameEdited) {
          setDuplicateName(`${detail.name} Copy`);
        }
        setDeletePending(false);
      })
      .catch((error) => {
        if (auth.handleAuthorityDenial(error)) {
          return;
        }
        toast.error(error instanceof Error ? error.message : "Failed to load council");
      });
  }, [auth, councils, duplicateNameEdited, selectedRef]);

  const selectedCouncil = useMemo(
    () => councils.find((council) => encodeRef(council.ref) === selectedRef) ?? null,
    [councils, selectedRef],
  );
  const invalidSeats = members.filter((member) => seatValidity[member.memberPosition] === false);
  const hasInvalidSeats = invalidSeats.length > 0;

  const handleMemberChange = useCallback((next: EditableCouncilMember) => {
    setMembers((current) =>
      current.map((item) => (item.memberPosition === next.memberPosition ? next : item)),
    );
  }, []);

  const handleSeatValidityChange = useCallback((memberPosition: number, valid: boolean) => {
    setSeatValidity((current) => ({ ...current, [memberPosition]: valid }));
  }, []);

  async function refreshCouncils(nextSelected?: string) {
    if (!auth.authHeader) {
      return;
    }
    const result = await fetchCouncils(auth.authHeader);
    setCouncils(result.councils);
    if (nextSelected) {
      setSelectedRef(nextSelected);
    }
  }

  async function handleDuplicate() {
    if (!auth.authHeader || !selectedCouncil || !duplicateName.trim()) {
      return;
    }
    try {
      const result = await duplicateCouncil(
        auth.authHeader,
        selectedCouncil.ref,
        duplicateName.trim(),
      );
      setDuplicateNameEdited(false);
      await refreshCouncils(`user:${result.councilId}`);
      toast.success("Council duplicated");
    } catch (error) {
      if (auth.handleAuthorityDenial(error)) {
        return;
      }
      toast.error(error instanceof Error ? error.message : "Duplicate failed");
    }
  }

  async function handleSave() {
    if (!auth.authHeader || !selectedCouncil || selectedCouncil.ref.kind !== "user") {
      return;
    }
    if (hasInvalidSeats) {
      toast.error("Resolve the invalid model seats before saving.");
      return;
    }
    try {
      await updateCouncil({
        authHeader: auth.authHeader,
        ref: selectedCouncil.ref,
        name,
        phasePrompts,
        members,
      });
      await refreshCouncils(selectedRef);
      toast.success("Council saved");
    } catch (error) {
      if (auth.handleAuthorityDenial(error)) {
        return;
      }
      toast.error(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function handleDelete() {
    if (!auth.authHeader || !selectedCouncil || selectedCouncil.ref.kind !== "user") {
      return;
    }
    try {
      await deleteCouncil(auth.authHeader, selectedCouncil.ref);
      await refreshCouncils();
      setSelectedRef("");
      setDeletePending(false);
      toast.success("Council deleted");
    } catch (error) {
      if (auth.handleAuthorityDenial(error)) {
        return;
      }
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  }

  async function handleEndDemoAndOpenByok() {
    setDemoByokEnding(true);
    setDemoByokError(null);
    try {
      await auth.clearDemoSession();
      writeLastCouncilRef(FOUNDING_COUNCIL_CHOICE);
      window.location.assign("/?unlock=byok");
    } catch (error) {
      setDemoByokError(error instanceof Error ? error.message : "Demo logout failed");
    } finally {
      setDemoByokEnding(false);
    }
  }

  if (!auth.isAuthenticated) {
    return <CouncilLockedNotice message="Use your OpenRouter key to manage councils." />;
  }

  if (auth.mode === "demo") {
    return (
      <CouncilDemoNotice
        demoByokConfirmOpen={demoByokConfirmOpen}
        demoByokEnding={demoByokEnding}
        demoByokError={demoByokError}
        onCancelDemoEnd={() => {
          setDemoByokError(null);
          setDemoByokConfirmOpen(false);
        }}
        onConfirmDemoEnd={handleEndDemoAndOpenByok}
        onOpenDemoEnd={() => {
          setDemoByokError(null);
          setDemoByokConfirmOpen(true);
        }}
      />
    );
  }

  const authHeader = auth.authHeader;
  if (!authHeader) {
    return <CouncilLockedNotice message="Use your OpenRouter key before council data can load." />;
  }

  return (
    <div className="council-screen-grid grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="council-library-panel p-6">
        <Badge className="seal">Council settings</Badge>
        <h1 className="surface-title mt-4">Manage councils</h1>
        <Link className="text-link mt-3 inline-flex" href="/">
          Back to Ask
        </Link>
        <div className="mt-5 space-y-3">
          {councils.map((council) => {
            const ref = encodeRef(council.ref);
            const selected = selectedRef === ref;
            return (
              <button
                key={ref}
                type="button"
                aria-pressed={selected}
                className={
                  selected
                    ? "panel panel-interactive council-library-row council-library-row-active w-full text-left"
                    : "panel panel-interactive council-library-row w-full text-left"
                }
                onClick={() => setSelectedRef(ref)}
              >
                <div className="text-sm font-semibold">{council.name}</div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  {council.description ?? "Custom council"}
                </div>
              </button>
            );
          })}
        </div>
        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleDuplicate();
          }}
        >
          <Label htmlFor={`${fieldPrefix}-duplicate-name`}>Duplicate selected council</Label>
          <Input
            id={`${fieldPrefix}-duplicate-name`}
            value={duplicateName}
            onChange={(event) => {
              setDuplicateNameEdited(true);
              setDuplicateName(event.target.value);
            }}
          />
          <Button type="submit" variant="secondary" disabled={!selectedCouncil}>
            Duplicate
          </Button>
        </form>
      </Card>

      <div className="council-editor-panel space-y-6">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge className="seal">{editable ? "Editable" : "Template"}</Badge>
              <div className="mt-4 font-display text-3xl leading-none text-[var(--brass)]">
                {name || "Select a council"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {editable ? (
                <Button onClick={handleSave} disabled={hasInvalidSeats}>
                  Save
                </Button>
              ) : null}
              {deletable ? (
                <Button variant="danger" onClick={() => setDeletePending(true)}>
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
          {editable ? (
            <div className="mt-5 max-w-xl space-y-2">
              <Label htmlFor={`${fieldPrefix}-name`}>Council name</Label>
              <Input
                id={`${fieldPrefix}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          ) : null}
          {deletePending ? (
            <div className="panel confirm-panel mt-5">
              <div>
                <p className="m-0 font-semibold">Delete this council?</p>
                <p className="m-0 mt-1 text-sm text-[var(--text-dim)]">
                  The custom council is removed from your library. Built-in councils remain
                  available.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setDeletePending(false)}>
                  Keep council
                </Button>
                <Button variant="danger" size="sm" onClick={handleDelete}>
                  Delete council
                </Button>
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="surface-title">The seven seats</h2>
            <p className="text-xs italic text-[var(--text-dim)]">
              Six reviewers draft and critique; a seventh writes the final answer.
            </p>
          </div>
          {hasInvalidSeats ? (
            <div className="alert-danger mt-5" role="alert">
              <p className="m-0 font-semibold">Resolve invalid model seats before saving.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {invalidSeats.map((member) => {
                  const alias = String.fromCharCode(64 + member.memberPosition);
                  return (
                    <button
                      key={member.memberPosition}
                      type="button"
                      className="text-link"
                      onClick={() => {
                        window.document
                          .querySelector<HTMLButtonElement>(`[data-seat-model-control="${alias}"]`)
                          ?.focus();
                      }}
                    >
                      Seat {alias}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {members.map((member) => (
              <ModelSlotEditor
                key={member.memberPosition}
                authHeader={authHeader}
                member={member}
                editable={editable}
                onAuthorityDenial={auth.handleAuthorityDenial}
                onValidityChange={handleSeatValidityChange}
                onChange={handleMemberChange}
              />
            ))}
          </div>
        </Card>

        <details className="card p-6">
          <summary className="disclosure-summary">
            <span className="surface-title">Advanced council instructions</span>
            <span className="text-xs italic text-[var(--text-dim)]">
              Prompts and output formats
            </span>
          </summary>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p id={`${fieldPrefix}-phase1-output-label`} className="docket-question-label">
                Answer protocol
              </p>
              <pre id={`${fieldPrefix}-phase1-output`} className="protocol-block">
                {outputFormats.phase1}
              </pre>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldPrefix}-phase1-prompt`}>Answer instructions</Label>
              <Textarea
                id={`${fieldPrefix}-phase1-prompt`}
                value={phasePrompts.phase1}
                onChange={(event) =>
                  setPhasePrompts((current) => ({ ...current, phase1: event.target.value }))
                }
                disabled={!editable}
              />
            </div>
            <div className="space-y-2">
              <p id={`${fieldPrefix}-phase2-output-label`} className="docket-question-label">
                Evaluation protocol
              </p>
              <pre id={`${fieldPrefix}-phase2-output`} className="protocol-block">
                {outputFormats.phase2}
              </pre>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldPrefix}-phase2-prompt`}>Evaluation instructions</Label>
              <Textarea
                id={`${fieldPrefix}-phase2-prompt`}
                value={phasePrompts.phase2}
                onChange={(event) =>
                  setPhasePrompts((current) => ({ ...current, phase2: event.target.value }))
                }
                disabled={!editable}
              />
            </div>
            <div className="space-y-2">
              <p id={`${fieldPrefix}-phase3-output-label`} className="docket-question-label">
                Final answer protocol
              </p>
              <pre id={`${fieldPrefix}-phase3-output`} className="protocol-block">
                {outputFormats.phase3}
              </pre>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${fieldPrefix}-phase3-prompt`}>Final answer instructions</Label>
              <Textarea
                id={`${fieldPrefix}-phase3-prompt`}
                value={phasePrompts.phase3}
                onChange={(event) =>
                  setPhasePrompts((current) => ({ ...current, phase3: event.target.value }))
                }
                disabled={!editable}
              />
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
