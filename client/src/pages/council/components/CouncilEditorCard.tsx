import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { MEMBER_POSITIONS, memberForPosition } from "@shared/domain/sevenMembers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ModelIdInput } from "@/components/ModelIdInput";
import { buildEmptyCouncilMemberTuning, type CouncilDraft, type CouncilDraftMember } from "../domain/councilDraft";
import type { CouncilMemberTuning } from "@shared/domain/councilMemberTuning";
import { CopyButton } from "@/components/CopyButton";

/**
 * CouncilEditorCard renders the council roster and prompt editing surface.
 */
export function CouncilEditorCard(props: {
  editable: boolean;
  deletable: boolean;
  isUserCouncil: boolean;
  isBusy: boolean;
  isSaving: boolean;
  isDeleting: boolean;
  saveDisabledReason: string | null;
  outputFormats: Readonly<{ phase1: string; phase2: string; phase3: string }>;
  draft: CouncilDraft;
  onNameChange: (name: string) => void;
  onMemberModelIdChange: (memberPosition: number, modelId: string) => void;
  onMemberTuningChange: (memberPosition: number, tuning: CouncilMemberTuning) => void;
  onPhasePromptChange: (phase: "phase1" | "phase2" | "phase3", value: string) => void;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);
  const saveDisabled =
    !props.editable ||
    props.isBusy ||
    props.isSaving ||
    (props.saveDisabledReason !== null && props.saveDisabledReason.length > 0);

  const membersByPosition = useMemo(() => {
    const map = new Map<number, CouncilDraftMember>();
    for (const member of props.draft.members) {
      map.set(member.memberPosition, member);
    }
    return map;
  }, [props.draft.members]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{props.editable ? "Edit Council" : "Council Template"}</CardTitle>
            <CardDescription className="text-sm">
              Slots A–F reply + critique. Slot G delivers the verdict.
            </CardDescription>
          </div>
          <div className="action-rail">
            <CopyButton value={JSON.stringify(props.draft, null, 2)} tooltip="Copy council JSON" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            value={props.draft.name}
            onChange={(e) => props.onNameChange(e.target.value)}
            disabled={!props.editable || props.isBusy}
          />
        </div>

        <div className="space-y-3">
          <div className="text-sm font-medium">Roster</div>
          <div className="space-y-4">
            {MEMBER_POSITIONS.map((memberPosition) => {
              const member = memberForPosition(memberPosition);
              const draftMember = membersByPosition.get(memberPosition) ?? {
                memberPosition,
                modelId: "",
                tuning: buildEmptyCouncilMemberTuning(),
              };

              return (
                <div key={memberPosition} className="inset space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-medium text-foreground flex items-center gap-2">
                      <span className="badge badge-primary">{member.alias}</span>
                      {member.label}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Role: {member.role === "synthesizer" ? "Verdict" : "Replies + critique"}
                    </div>
                  </div>
                  <ModelIdInput
                    value={draftMember.modelId}
                    onChange={(value) => props.onMemberModelIdChange(memberPosition, value)}
                    tuning={draftMember.tuning}
                    onTuningChange={(tuning) => props.onMemberTuningChange(memberPosition, tuning)}
                    disabled={!props.editable || props.isBusy}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <Collapsible open={promptsOpen} onOpenChange={setPromptsOpen}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">Phase Prompts</div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="group">
                {promptsOpen ? "Hide prompts" : "Show prompts"}
                <ChevronDown className="icon-sm transition-transform group-data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="mt-3 space-y-4">
            <div className="inset space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Phase 1 (Members A–F)</Label>
                <CopyButton value={props.draft.phasePrompts.phase1} tooltip="Copy phase 1 prompt" />
              </div>
              <Textarea
                value={props.draft.phasePrompts.phase1}
                onChange={(e) => props.onPhasePromptChange("phase1", e.target.value)}
                rows={6}
                disabled={!props.editable || props.isBusy}
                className="control-compact font-mono"
              />
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">Injected output format (read-only)</Label>
                  <CopyButton value={props.outputFormats.phase1} tooltip="Copy output format" />
                </div>
                <Textarea
                  value={props.outputFormats.phase1}
                  readOnly
                  rows={4}
                  className="control-compact control-readonly font-mono resize-none"
                />
              </div>
            </div>

            <div className="inset space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Phase 2 (Members A–F)</Label>
                <CopyButton value={props.draft.phasePrompts.phase2} tooltip="Copy phase 2 prompt" />
              </div>
              <Textarea
                value={props.draft.phasePrompts.phase2}
                onChange={(e) => props.onPhasePromptChange("phase2", e.target.value)}
                rows={6}
                disabled={!props.editable || props.isBusy}
                className="control-compact font-mono"
              />
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">Injected output format (read-only)</Label>
                  <CopyButton value={props.outputFormats.phase2} tooltip="Copy output format" />
                </div>
                <Textarea
                  value={props.outputFormats.phase2}
                  readOnly
                  rows={10}
                  className="control-compact control-readonly font-mono resize-none"
                />
              </div>
            </div>

            <div className="inset space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Phase 3 (Member G)</Label>
                <CopyButton value={props.draft.phasePrompts.phase3} tooltip="Copy phase 3 prompt" />
              </div>
              <Textarea
                value={props.draft.phasePrompts.phase3}
                onChange={(e) => props.onPhasePromptChange("phase3", e.target.value)}
                rows={8}
                disabled={!props.editable || props.isBusy}
                className="control-compact font-mono"
              />
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-muted-foreground">Injected output format (read-only)</Label>
                  <CopyButton value={props.outputFormats.phase3} tooltip="Copy output format" />
                </div>
                <Textarea
                  value={props.outputFormats.phase3}
                  readOnly
                  rows={4}
                  className="control-compact control-readonly font-mono resize-none"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="action-rail">
          {props.isUserCouncil && (
            <Button
              onClick={async () => {
                await props.onSave().catch(() => undefined);
              }}
              disabled={saveDisabled}
            >
              Save Council
            </Button>
          )}

          {props.isUserCouncil && (
            <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={!props.deletable || props.isBusy || props.isDeleting}
                >
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Council?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes{" "}
                    <span className="font-medium">{props.draft.name || "this council"}</span>.
                    Runs that already happened will still keep their council snapshot.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={props.isDeleting}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={props.isDeleting}
                    onClick={async () => {
                      await props.onDelete().catch(() => undefined);
                      setDeleteConfirmOpen(false);
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {(props.isSaving || props.isDeleting) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">Saving…</div>
          )}
        </div>

        {props.isUserCouncil && props.editable && props.saveDisabledReason && (
          <p className="text-xs text-muted-foreground">{props.saveDisabledReason}</p>
        )}
      </CardContent>
    </Card>
  );
}
