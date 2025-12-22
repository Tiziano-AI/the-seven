import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteCouncil, duplicateCouncil, fetchCouncil, fetchCouncils, updateCouncil } from "@/lib/api";
import { useNavigate } from "@/lib/routing/router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CouncilRef } from "@/features/councils/domain/councilRef";
import { CouncilEditorCard } from "./components/CouncilEditorCard";
import { CouncilListCard } from "./components/CouncilListCard";
import { DuplicateCouncilDialog } from "./components/DuplicateCouncilDialog";
import {
  buildEmptyCouncilDraft,
  buildEmptyCouncilMemberTuning,
  validateCouncilDraftForSave,
  type CouncilDraft,
} from "./domain/councilDraft";
import type { CouncilMemberTuning } from "@shared/domain/councilMemberTuning";
import { Skeleton } from "@/components/ui/skeleton";

function isUserCouncilRef(ref: CouncilRef): ref is Readonly<{ kind: "user"; councilId: number }> {
  return ref.kind === "user";
}

/**
 * CouncilPage renders council list + editor in a two-column layout.
 */
export default function CouncilPage() {
  const { authHeader, isAuthenticated, mode } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated || mode === "demo") {
      navigate("/");
    }
  }, [isAuthenticated, mode, navigate]);

  const councilsQuery = useQuery({
    queryKey: ["councils", authHeader],
    queryFn: async () => {
      if (!authHeader) return { councils: [] };
      return fetchCouncils({ authHeader });
    },
    enabled: !!authHeader,
    refetchOnWindowFocus: false,
  });

  const [selectedRef, setSelectedRef] = useState<CouncilRef | null>(null);
  const councilQuery = useQuery({
    queryKey: ["council", selectedRef, authHeader],
    queryFn: async () => {
      if (!authHeader || !selectedRef) {
        return null;
      }
      return fetchCouncil({ authHeader, ref: selectedRef });
    },
    enabled: !!authHeader && selectedRef !== null,
    refetchOnWindowFocus: false,
  });

  const [draft, setDraft] = useState<CouncilDraft>(buildEmptyCouncilDraft());

  useEffect(() => {
    if (!councilQuery.data) return;
    setDraft({
      name: councilQuery.data.name,
      phasePrompts: councilQuery.data.phasePrompts,
      members: councilQuery.data.members.map((member) => ({
        memberPosition: member.memberPosition,
        modelId: member.model.modelId,
        tuning: member.tuning ?? buildEmptyCouncilMemberTuning(),
      })),
    });
  }, [councilQuery.data]);

  const duplicateMutation = useMutation({
    mutationFn: async (params: { source: CouncilRef; name: string }) => {
      if (!authHeader) throw new Error("Missing authentication");
      return duplicateCouncil({ authHeader, source: params.source, name: params.name });
    },
    onSuccess: async (data) => {
      toast.success("Council created");
      setDuplicateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["councils"] });
      setSelectedRef({ kind: "user", councilId: data.councilId });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to duplicate"),
  });

  const updateMutation = useMutation({
    mutationFn: async (params: {
      councilId: number;
      name: string;
      phasePrompts: CouncilDraft["phasePrompts"];
      members: Array<{ memberPosition: number; model: { provider: string; modelId: string }; tuning: CouncilMemberTuning }>;
    }) => {
      if (!authHeader) throw new Error("Missing authentication");
      return updateCouncil({
        authHeader,
        councilId: params.councilId,
        name: params.name,
        phasePrompts: params.phasePrompts,
        members: params.members,
      });
    },
    onSuccess: async () => {
      toast.success("Council saved");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["councils"] }),
        queryClient.invalidateQueries({ queryKey: ["council"] }),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (params: { councilId: number }) => {
      if (!authHeader) throw new Error("Missing authentication");
      return deleteCouncil({ authHeader, councilId: params.councilId });
    },
    onSuccess: async () => {
      toast.success("Council deleted");
      setSelectedRef(null);
      await queryClient.invalidateQueries({ queryKey: ["councils"] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to delete"),
  });

  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicateSource, setDuplicateSource] = useState<CouncilRef | null>(null);

  const councilItems = councilsQuery.data?.councils ?? [];
  const isBusy = councilsQuery.isLoading || councilQuery.isLoading || updateMutation.isPending;

  const selectedIsUserCouncil = selectedRef !== null && isUserCouncilRef(selectedRef);
  const selectedCouncilId = selectedIsUserCouncil ? selectedRef.councilId : null;
  const draftValidation = validateCouncilDraftForSave(draft);
  const saveDisabledReason =
    selectedIsUserCouncil && councilQuery.data?.editable && !draftValidation.ok
      ? draftValidation.message
      : null;

  function updateMemberModelId(memberPosition: number, modelId: string) {
    setDraft((current) => ({
      ...current,
      members: current.members.map((m) =>
        m.memberPosition === memberPosition ? { ...m, modelId } : m
      ),
    }));
  }

  function updateMemberTuning(memberPosition: number, tuning: CouncilMemberTuning) {
    setDraft((current) => ({
      ...current,
      members: current.members.map((m) =>
        m.memberPosition === memberPosition ? { ...m, tuning } : m
      ),
    }));
  }

  if (!isAuthenticated) return null;

  if (councilsQuery.isLoading && !councilsQuery.data) {
    return (
      <AppShell layout="centered">
        <div className="space-y-4 w-full max-w-3xl">
          <Skeleton className="h-8 w-48" />
          <Card>
            <CardContent className="pt-6 pb-6 space-y-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (councilsQuery.isError) {
    return (
      <AppShell layout="centered">
        <Card>
          <CardContent className="pt-8 pb-8">
            <p className="text-muted-foreground">{councilsQuery.error.message}</p>
            <Button onClick={() => navigate("/")} className="mt-4">
              Back to Ask
            </Button>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <DuplicateCouncilDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        source={duplicateSource}
        name={duplicateName}
        onNameChange={setDuplicateName}
        isPending={duplicateMutation.isPending}
        onDuplicate={async ({ source, name }) => {
          await duplicateMutation.mutateAsync({ source, name });
        }}
      />

      <div className="content-wide">
        <div className="mb-6">
          <h1>Council</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Councils are saved 7-member lineups. Select one per question.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <CouncilListCard
            councils={councilItems}
            selectedRef={selectedRef}
            isBusy={isBusy}
            isDuplicatePending={duplicateMutation.isPending}
            onSelect={setSelectedRef}
            onDuplicateRequest={(council) => {
              setDuplicateSource(council.ref);
              setDuplicateName(`${council.name} (Copy)`);
              setDuplicateOpen(true);
            }}
          />

          {selectedRef && councilQuery.data ? (
            <CouncilEditorCard
              editable={councilQuery.data.editable}
              deletable={councilQuery.data.deletable}
              isUserCouncil={selectedIsUserCouncil}
              isBusy={isBusy}
              isSaving={updateMutation.isPending}
              isDeleting={deleteMutation.isPending}
              saveDisabledReason={saveDisabledReason}
              outputFormats={councilQuery.data.outputFormats}
              draft={draft}
              onNameChange={(name) => setDraft((current) => ({ ...current, name }))}
              onMemberModelIdChange={updateMemberModelId}
              onMemberTuningChange={updateMemberTuning}
              onPhasePromptChange={(phase, value) => {
                setDraft((current) => ({
                  ...current,
                  phasePrompts: { ...current.phasePrompts, [phase]: value },
                }));
              }}
              onSave={async () => {
                if (!selectedCouncilId) return;

                const validated = validateCouncilDraftForSave(draft);
                if (!validated.ok) {
                  toast.error(validated.message);
                  return;
                }

                await updateMutation.mutateAsync({
                  councilId: selectedCouncilId,
                  name: validated.value.name,
                  phasePrompts: validated.value.phasePrompts,
                  members: validated.value.members.map((member) => ({
                    memberPosition: member.memberPosition,
                    model: { provider: "openrouter", modelId: member.modelId },
                    tuning: member.tuning,
                  })),
                });
              }}
              onDelete={async () => {
                if (!selectedCouncilId) return;
                await deleteMutation.mutateAsync({ councilId: selectedCouncilId });
              }}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Select a council</CardTitle>
                <CardDescription>
                  Select a saved lineup to inspect prompts, models, and output formats.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Built-in councils are read-only. Duplicate one to create an editable copy.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
