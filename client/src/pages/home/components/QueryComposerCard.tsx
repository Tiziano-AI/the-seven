import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, X } from "lucide-react";
import { useRef, type ChangeEvent } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * QueryComposerCard renders the Ask form.
 */
export function QueryComposerCard(props: {
  councils: ReadonlyArray<{ label: string; value: string }>;
  councilValue: string;
  onCouncilChange: (value: string) => void;
  isCouncilsLoading: boolean;
  councilsError: string | null;
  onRetryCouncils: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  files: File[];
  fileInputAccept: string;
  isSubmitting: boolean;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onSubmit: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bring a Question</CardTitle>
        <CardDescription>
          Six voices respond. Then they challenge each other. Then the council delivers one verdict.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Council</Label>
          {props.isCouncilsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3 w-48" />
            </div>
          ) : (
            <Select
              value={props.councilValue}
              onValueChange={props.onCouncilChange}
              disabled={props.isSubmitting || props.isCouncilsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a council…" />
              </SelectTrigger>
              <SelectContent>
                {props.councils.map((council) => (
                  <SelectItem key={council.value} value={council.value}>
                    {council.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {props.councilsError && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              <span>Couldn’t load councils: {props.councilsError}</span>
              <Button variant="ghost" size="sm" onClick={props.onRetryCouncils}>
                Retry
              </Button>
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Select a council for each question.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="query">Your Question</Label>
          <Textarea
            id="query"
            value={props.query}
            onChange={(e) => props.onQueryChange(e.target.value)}
            placeholder="What do you want the council to decide?"
            rows={4}
          />
        </div>

        {props.files.length > 0 && (
          <div className="space-y-2">
            <Label>Context</Label>
            <div className="flex flex-wrap gap-2">
              {props.files.map((file, index) => (
                <div
                  key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
                  className="chip"
                >
                  <span className="text-sm">{file.name}</span>
                  <button
                    onClick={() => props.onRemoveFile(index)}
                    className="btn btn-ghost btn-size-icon-sm hover:text-destructive"
                  >
                    <X className="icon-xs" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              We’ll include this context with your question.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <label
              htmlFor="file-upload"
              role="button"
              tabIndex={0}
              aria-label="Add context files"
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                fileInputRef.current?.click();
              }}
            >
              <Upload className="icon-sm" />
              Add Context
              <input
                id="file-upload"
                type="file"
                multiple
                ref={fileInputRef}
                onChange={props.onFileChange}
                className="hidden"
                accept={props.fileInputAccept}
              />
            </label>
          </Button>
          <Button
            size="sm"
            onClick={props.onSubmit}
            disabled={props.isSubmitting || !props.query.trim() || !props.councilValue}
            className="ml-auto"
          >
            {props.isSubmitting && <Loader2 className="animate-spin icon-sm" />}
            Ask the Council
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
