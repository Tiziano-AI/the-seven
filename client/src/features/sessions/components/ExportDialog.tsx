import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { fetchSession, fetchSessionDiagnostics } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_EXPORT_SELECTION,
  buildExportFilename,
  buildJsonExport,
  buildMarkdownExport,
  type ExportItemKey,
  type ExportRunBundle,
  type ExportSelection,
} from "@/features/sessions/domain/export";

type ExportDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: ReadonlyArray<number>;
}>;

const EXPORT_ITEMS: ReadonlyArray<Readonly<{ key: ExportItemKey; label: string; description: string }>> = [
  { key: "question", label: "Question", description: "Original question text." },
  { key: "verdict", label: "Verdict (Phase 3)", description: "Final synthesized answer." },
  { key: "critiques", label: "Critiques (Phase 2)", description: "Peer review outputs." },
  { key: "replies", label: "Replies (Phase 1)", description: "Initial member responses." },
  { key: "costs", label: "Costs & usage", description: "Token totals and billing." },
  { key: "prompts", label: "Prompts & formats", description: "Phase prompts + output formats + task message." },
  { key: "model_config", label: "Model config", description: "Member models + tuning." },
  { key: "diagnostics", label: "Diagnostics", description: "OpenRouter call metadata and errors." },
];

export function ExportDialog(props: ExportDialogProps) {
  const { authHeader } = useAuth();
  const [selection, setSelection] = useState<ExportSelection>(DEFAULT_EXPORT_SELECTION);
  const [formats, setFormats] = useState<Readonly<{ json: boolean; markdown: boolean }>>({
    json: true,
    markdown: true,
  });
  const [isExporting, setIsExporting] = useState(false);

  const selectedCount = props.selectedIds.length;
  const canExport = selectedCount > 0 && (formats.json || formats.markdown);

  const sortedIds = useMemo(() => {
    return [...props.selectedIds].sort((a, b) => a - b);
  }, [props.selectedIds]);

  const toggleItem = (key: ExportItemKey, next: boolean | "indeterminate") => {
    setSelection((current) => ({
      ...current,
      [key]: next === true,
    }));
  };

  const setFormat = (key: "json" | "markdown", next: boolean | "indeterminate") => {
    setFormats((current) => ({
      ...current,
      [key]: next === true,
    }));
  };

  const downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleExport = async () => {
    if (!canExport) {
      toast.error("Select runs and at least one export format.");
      return;
    }
    if (!authHeader) {
      toast.error("Sign in again to export runs.");
      return;
    }

    setIsExporting(true);
    try {
      const runs: ExportRunBundle[] = await Promise.all(
        sortedIds.map(async (sessionId) => {
          const [session, diagnostics] = await Promise.all([
            fetchSession({ authHeader, sessionId }),
            fetchSessionDiagnostics({ authHeader, sessionId }),
          ]);
          return { session, diagnostics };
        })
      );

      const exportedAt = new Date().toISOString();

      if (formats.json) {
        const payload = buildJsonExport({ exportedAt, selection, runs });
        const json = JSON.stringify(payload, null, 2);
        downloadFile(json, buildExportFilename({ sessionIds: sortedIds, extension: "json", exportedAt }), "application/json");
      }

      if (formats.markdown) {
        const markdown = buildMarkdownExport({ exportedAt, selection, runs });
        downloadFile(markdown, buildExportFilename({ sessionIds: sortedIds, extension: "md", exportedAt }), "text/markdown");
      }

      toast.success(`Exported ${selectedCount} run${selectedCount === 1 ? "" : "s"}.`);
      props.onOpenChange(false);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{selectedCount === 1 ? "Export run" : "Export runs"}</DialogTitle>
          <DialogDescription>
            Export {selectedCount} selected run{selectedCount === 1 ? "" : "s"} as JSON and/or Markdown. Attachments are always included.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-3">
            <Label>Formats</Label>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={formats.json} onCheckedChange={(next) => setFormat("json", next)} />
                JSON (structured)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={formats.markdown} onCheckedChange={(next) => setFormat("markdown", next)} />
                Markdown (human‑readable)
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Items to include</Label>
            <div className="grid gap-3">
              {EXPORT_ITEMS.map((item) => (
                <label key={item.key} className="flex items-start gap-3">
                  <Checkbox
                    checked={selection[item.key]}
                    onCheckedChange={(next) => toggleItem(item.key, next)}
                  />
                  <div>
                    <div className="text-sm font-medium text-foreground">{item.label}</div>
                    <div className="text-xs text-muted-foreground">{item.description}</div>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Attachments are always included in both formats.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={() => void handleExport()} disabled={isExporting || !canExport}>
            {isExporting ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
