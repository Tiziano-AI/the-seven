"use client";

import { useEffect, useId, useMemo, useState } from "react";
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
  const [editable, setEditable] = useState(false);
  const [deletable, setDeletable] = useState(false);

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
        toast.error(error instanceof Error ? error.message : "Failed to load councils");
      });
  }, [auth.authHeader, auth.mode]);

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
        setEditable(detail.editable);
        setDeletable(detail.deletable);
        setDuplicateName(`${detail.name} Copy`);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "Failed to load council");
      });
  }, [auth.authHeader, councils, selectedRef]);

  const selectedCouncil = useMemo(
    () => councils.find((council) => encodeRef(council.ref) === selectedRef) ?? null,
    [councils, selectedRef],
  );

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
      await refreshCouncils(`user:${result.councilId}`);
      toast.success("Council duplicated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Duplicate failed");
    }
  }

  async function handleSave() {
    if (!auth.authHeader || !selectedCouncil || selectedCouncil.ref.kind !== "user") {
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
      toast.success("Council deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  }

  if (!auth.isAuthenticated) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--muted-foreground)]">Unlock BYOK to manage councils.</p>
      </Card>
    );
  }

  if (auth.mode === "demo") {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--muted-foreground)]">
          Demo mode is locked to the Commons Council. Council authoring is available only in BYOK
          mode.
        </p>
      </Card>
    );
  }

  const authHeader = auth.authHeader;
  if (!authHeader) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[var(--muted-foreground)]">
          BYOK authentication is required before council data can load.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="p-6">
        <Badge>Council Library</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Councils</h1>
        <div className="mt-5 space-y-3">
          {councils.map((council) => (
            <button
              key={council.name}
              type="button"
              className="w-full rounded-[24px] border border-[var(--border)] bg-white/70 p-4 text-left transition hover:border-[var(--accent)]"
              onClick={() => setSelectedRef(encodeRef(council.ref))}
            >
              <div className="text-sm font-semibold">{council.name}</div>
              <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                {council.description ?? "Custom council"}
              </div>
            </button>
          ))}
        </div>
        <div className="mt-6 space-y-3">
          <Label htmlFor={`${fieldPrefix}-duplicate-name`}>Duplicate Selected Council</Label>
          <Input
            id={`${fieldPrefix}-duplicate-name`}
            value={duplicateName}
            onChange={(event) => setDuplicateName(event.target.value)}
          />
          <Button variant="secondary" onClick={handleDuplicate} disabled={!selectedCouncil}>
            Duplicate
          </Button>
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Badge>{editable ? "Editable" : "Template"}</Badge>
              <div className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
                {name || "Select a council"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {editable ? <Button onClick={handleSave}>Save</Button> : null}
              {deletable ? (
                <Button variant="danger" onClick={handleDelete}>
                  Delete
                </Button>
              ) : null}
            </div>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${fieldPrefix}-name`}>Name</Label>
              <Input
                id={`${fieldPrefix}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={!editable}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldPrefix}-phase1-output`}>Phase 1 Output Format</Label>
              <Textarea
                id={`${fieldPrefix}-phase1-output`}
                className="min-h-[110px]"
                value={outputFormats.phase1}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldPrefix}-phase1-prompt`}>Phase 1 Prompt</Label>
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
              <Label htmlFor={`${fieldPrefix}-phase2-output`}>Phase 2 Output Format</Label>
              <Textarea
                id={`${fieldPrefix}-phase2-output`}
                className="min-h-[110px]"
                value={outputFormats.phase2}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${fieldPrefix}-phase2-prompt`}>Phase 2 Prompt</Label>
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
              <Label htmlFor={`${fieldPrefix}-phase3-output`}>Phase 3 Output Format</Label>
              <Textarea
                id={`${fieldPrefix}-phase3-output`}
                className="min-h-[110px]"
                value={outputFormats.phase3}
                disabled
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`${fieldPrefix}-phase3-prompt`}>Phase 3 Prompt</Label>
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
        </Card>

        <Card className="p-6">
          <h2 className="text-2xl font-semibold tracking-[-0.04em]">Members</h2>
          <div className="mt-5 grid gap-4">
            {members.map((member, index) => (
              <ModelSlotEditor
                key={member.memberPosition}
                authHeader={authHeader}
                member={member}
                onChange={(next) =>
                  setMembers((current) =>
                    current.map((item, currentIndex) => (currentIndex === index ? next : item)),
                  )
                }
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
