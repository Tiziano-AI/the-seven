import type { CouncilRef } from "@/features/councils/domain/councilRef";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DuplicateCouncilDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: CouncilRef | null;
  name: string;
  onNameChange: (name: string) => void;
  isPending: boolean;
  onDuplicate: (params: { source: CouncilRef; name: string }) => Promise<void>;
}) {
  const trimmedName = props.name.trim();
  const canSubmit = !!props.source && trimmedName.length > 0 && !props.isPending;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate Council</DialogTitle>
          <DialogDescription>Create an editable copy of a council template.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            value={props.name}
            onChange={(e) => props.onNameChange(e.target.value)}
            placeholder="My Council"
            disabled={props.isPending}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => props.onOpenChange(false)}
            disabled={props.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              if (!props.source) return;
              if (!trimmedName) return;
              await props.onDuplicate({ source: props.source, name: trimmedName }).catch(() => undefined);
            }}
            disabled={!canSubmit}
          >
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
