import { encodeCouncilRef, type CouncilRef } from "@/features/councils/domain/councilRef";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type CouncilListItem = Readonly<{
  ref: CouncilRef;
  name: string;
  description: string | null;
  editable: boolean;
  deletable: boolean;
}>;

/**
 * CouncilListCard renders the selectable council list surface.
 */
export function CouncilListCard(props: {
  councils: ReadonlyArray<CouncilListItem>;
  selectedRef: CouncilRef | null;
  isBusy: boolean;
  isDuplicatePending: boolean;
  onSelect: (ref: CouncilRef) => void;
  onDuplicateRequest: (council: CouncilListItem) => void;
}) {
  const selectedKey = props.selectedRef ? encodeCouncilRef(props.selectedRef) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Councils</CardTitle>
        <CardDescription className="text-sm">
          Built-ins are templates. Duplicate to create an editable council.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {props.councils.length === 0 && (
          <p className="text-muted-foreground text-sm">No councils found.</p>
        )}

        {props.councils.map((council) => {
          const key = encodeCouncilRef(council.ref);
          const isSelected = selectedKey !== null && key === selectedKey;

          return (
            <div
              key={key}
              className="inset space-y-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">
                  {council.name}
                  {isSelected && <span className="text-muted-foreground"> • selected</span>}
                </div>
                {council.description && (
                  <div className="text-xs text-muted-foreground mt-1">{council.description}</div>
                )}
              </div>

              <div className="flex justify-end">
                <div className="action-rail">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => props.onSelect(council.ref)}
                    disabled={props.isBusy}
                  >
                    {council.editable ? "Edit" : "View"}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => props.onDuplicateRequest(council)}
                    disabled={props.isDuplicatePending}
                  >
                    Duplicate
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
