import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchCouncils, rerunSession } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { decodeCouncilRef, encodeCouncilRef } from "@/features/councils/domain/councilRef";
import { readLastCouncilValue, writeLastCouncilValue } from "@/features/councils/domain/lastCouncil";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

export type RerunDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: number;
  initialQuery: string;
  onRerunStarted: (newSessionId: number) => void;
}>;

export function RerunDialog(props: RerunDialogProps) {
  const { authHeader, mode } = useAuth();
  const [councilValue, setCouncilValue] = useState(() => readLastCouncilValue() ?? "");
  const [queryOverride, setQueryOverride] = useState(props.initialQuery);

  useEffect(() => {
    if (!props.open) return;
    setCouncilValue(readLastCouncilValue() ?? "");
    setQueryOverride(props.initialQuery);
  }, [props.initialQuery, props.open]);

  const councilsQuery = useQuery({
    queryKey: ["councils", authHeader],
    queryFn: async () => {
      if (!authHeader) return { councils: [] };
      return fetchCouncils({ authHeader });
    },
    enabled: props.open && !!authHeader,
    refetchOnWindowFocus: false,
  });

  const rerunMutation = useMutation({
    mutationFn: async (params: { sessionId: number; councilRef: ReturnType<typeof decodeCouncilRef>; queryOverride?: string }) => {
      if (!authHeader || !params.councilRef) {
        throw new Error("Missing authentication");
      }
      return rerunSession({
        authHeader,
        sessionId: params.sessionId,
        councilRef: params.councilRef,
        queryOverride: params.queryOverride,
      });
    },
    onSuccess: (data) => {
      toast.success("Rerun started");
      props.onRerunStarted(data.sessionId);
      props.onOpenChange(false);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to rerun");
    },
  });

  const councilOptions = useMemo(() => {
    const items = councilsQuery.data?.councils ?? [];
    return items.map((council) => ({
      label: council.name,
      value: encodeCouncilRef(council.ref),
    }));
  }, [councilsQuery.data]);

  const isBusy = councilsQuery.isLoading || rerunMutation.isPending;

  useEffect(() => {
    if (mode !== "demo") return;
    setCouncilValue("built_in:commons");
  }, [mode]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rerun</DialogTitle>
          <DialogDescription>
            Rerun creates a new run. Choose a council and (optionally) edit the question.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Council</Label>
            {councilsQuery.isError && (
              <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
                <span>Couldn’t load councils: {councilsQuery.error.message}</span>
                <Button variant="ghost" size="sm" onClick={() => void councilsQuery.refetch()}>
                  Retry
                </Button>
              </div>
            )}
            <Select
              value={councilValue}
              onValueChange={(value) => {
                setCouncilValue(value);
                if (decodeCouncilRef(value)) {
                  writeLastCouncilValue(value);
                }
              }}
              disabled={isBusy || mode === "demo"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a council…" />
              </SelectTrigger>
              <SelectContent>
                {councilOptions.map((council) => (
                  <SelectItem key={council.value} value={council.value}>
                    {council.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Question</Label>
            <Textarea
              value={queryOverride}
              onChange={(e) => setQueryOverride(e.target.value)}
              rows={6}
              disabled={isBusy}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={isBusy}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const councilRef = decodeCouncilRef(councilValue);
              if (!councilRef) {
                toast.error("Select a council first");
                return;
              }

              const trimmed = queryOverride.trim();
              if (!trimmed) {
                toast.error("Question must not be blank");
                return;
              }

              await rerunMutation.mutateAsync({
                sessionId: props.sessionId,
                councilRef,
                queryOverride: trimmed === props.initialQuery.trim() ? undefined : trimmed,
              });
            }}
            disabled={isBusy}
          >
            {rerunMutation.isPending && <Loader2 className="animate-spin icon-sm" />}
            Rerun
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
