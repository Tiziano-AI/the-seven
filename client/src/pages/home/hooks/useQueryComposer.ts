import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { decodeCouncilRef, encodeCouncilRef } from "@/features/councils/domain/councilRef";
import { FILE_INPUT_ACCEPT } from "@shared/domain/attachments";
import {
  clearActiveSessionId,
  readActiveSessionId,
  writeActiveSessionId,
} from "@/features/sessions/domain/activeSession";
import {
  clearLastCouncilValue,
  readLastCouncilValue,
  writeLastCouncilValue,
} from "@/features/councils/domain/lastCouncil";
import { clearQueryDraft, readQueryDraft, writeQueryDraft } from "@/features/sessions/domain/queryDraft";

export type AttachmentUpload = {
  name: string;
  base64: string;
};

type FileReadResult = Readonly<{ ok: true; base64: string }> | Readonly<{ ok: false; error: string }>;

function readFileAsBase64Data(file: File): Promise<FileReadResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        resolve({ ok: false, error: "File reader did not return a string" });
        return;
      }

      const commaIndex = result.indexOf(",");
      if (commaIndex < 0) {
        resolve({ ok: false, error: "File reader returned an invalid data URL" });
        return;
      }

      const base64 = result.slice(commaIndex + 1);
      if (!base64) {
        resolve({ ok: false, error: "File reader returned empty data" });
        return;
      }

      resolve({ ok: true, base64 });
    };

    reader.onerror = () => {
      resolve({ ok: false, error: "Failed to read file" });
    };

    reader.readAsDataURL(file);
  });
}

export function useQueryComposer(): {
  councils: ReadonlyArray<{ label: string; value: string }>;
  councilValue: string;
  setCouncilValue: (value: string) => void;
  isCouncilsLoading: boolean;
  query: string;
  setQuery: (value: string) => void;
  files: File[];
  fileInputAccept: string;
  isSubmitting: boolean;
  currentSessionId: number | null;
  clearActiveSession: () => void;
  onFileInputChange: (files: FileList | null) => void;
  removeFile: (index: number) => void;
  submit: () => Promise<void>;
} {
  const [query, setQuery] = useState(() => readQueryDraft());
  const [files, setFiles] = useState<File[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(() => readActiveSessionId());
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [councilValue, setCouncilValue] = useState(() => readLastCouncilValue() ?? "");

  const submitMutation = trpc.query.submit.useMutation();
  const councilsQuery = trpc.councils.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  const councilRef = useMemo(() => decodeCouncilRef(councilValue), [councilValue]);

  const isSubmitting =
    submitMutation.isPending || isProcessingFiles || councilsQuery.isLoading;

  const fileInputAccept = useMemo(() => FILE_INPUT_ACCEPT, []);

  const councils = useMemo(() => {
    const items = councilsQuery.data?.councils ?? [];
    return items.map((council) => ({
      label: council.name,
      value: encodeCouncilRef(council.ref),
    }));
  }, [councilsQuery.data]);

  useEffect(() => {
    if (!councilValue) return;
    if (councils.length === 0) return;
    const match = councils.some((council) => council.value === councilValue);
    if (match) return;
    setCouncilValue("");
    clearLastCouncilValue();
  }, [councilValue, councils]);

  const setCouncilValueWithMemory = useCallback((value: string) => {
    setCouncilValue(value);
    if (decodeCouncilRef(value)) {
      writeLastCouncilValue(value);
    }
  }, []);

  const setQueryWithDraft = useCallback((value: string) => {
    setQuery(value);
    writeQueryDraft(value);
  }, []);

  const onFileInputChange = useCallback(
    (selected: FileList | null) => {
      if (!selected || selected.length === 0) return;

      const incoming = Array.from(selected);

      setFiles((prev) => {
        return [...prev, ...incoming];
      });
    },
    [setFiles]
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearActiveSession = useCallback(() => {
    clearActiveSessionId();
    setCurrentSessionId(null);
  }, []);

  const submit = useCallback(async () => {
    if (!councilRef) {
      toast.error("Choose a council first");
      return;
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      toast.error("Bring a question first");
      return;
    }

    setIsProcessingFiles(true);
    try {
      const attachments: AttachmentUpload[] = [];
      for (const file of files) {
        const data = await readFileAsBase64Data(file);
        if (!data.ok) {
          toast.error(`Failed to read ${file.name}: ${data.error}`);
          toast.error("Nothing was sent. Fix the attachment and try again.");
          return;
        }

        attachments.push({ name: file.name, base64: data.base64 });
      }

      const result = await submitMutation.mutateAsync({
        query: trimmedQuery,
        councilRef: councilRef,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      setCurrentSessionId(result.sessionId);
      writeActiveSessionId(result.sessionId);
      toast.success("Sent. The council is at work.");
      setQuery("");
      clearQueryDraft();
      setFiles([]);
    } catch (error: unknown) {
      toast.error(
        `Couldn’t send your question: ${error instanceof Error ? error.message : "unknown error"}`
      );
    } finally {
      setIsProcessingFiles(false);
    }
  }, [councilRef, files, query, submitMutation]);

  return {
    councils,
    councilValue,
    setCouncilValue: setCouncilValueWithMemory,
    isCouncilsLoading: councilsQuery.isLoading,
    query,
    setQuery: setQueryWithDraft,
    files,
    fileInputAccept,
    isSubmitting,
    currentSessionId,
    clearActiveSession,
    onFileInputChange,
    removeFile,
    submit,
  };
}
