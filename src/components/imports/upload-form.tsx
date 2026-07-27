"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

type Phase = "idle" | "uploading" | "processing" | "error";

export function UploadForm({ maxSizeMb }: { maxSizeMb: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhase("idle");
    setProgress(0);
    setError(null);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const input = inputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setError("Please choose a .txt or .csv file to upload.");
      return;
    }
    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`The file exceeds the ${maxSizeMb} MB limit.`);
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/imports/upload");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.upload.onload = () => setPhase("processing");

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText) as { batchId: string };
          toast("File uploaded. Review the preview below.", "success");
          router.push(`/imports/${data.batchId}`);
          return;
        } catch {
          setPhase("error");
          setError("Unexpected server response.");
          return;
        }
      }
      let message = "Upload failed. Please try again.";
      try {
        const data = JSON.parse(xhr.responseText) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        /* keep default */
      }
      setPhase("error");
      setError(message);
    };

    xhr.onerror = () => {
      setPhase("error");
      setError("A network error occurred during upload.");
    };

    setPhase("uploading");
    setProgress(0);
    xhr.send(formData);
  }

  const busy = phase === "uploading" || phase === "processing";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label htmlFor="file">Report file (.txt or .csv)</Label>
        <input
          ref={inputRef}
          id="file"
          name="file"
          type="file"
          accept=".txt,.csv,text/csv,text/plain"
          required
          disabled={busy}
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? null);
            if (phase === "error") reset();
          }}
          className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700 disabled:opacity-60"
        />
        <p className="mt-1.5 text-xs text-slate-400">
          Ohio Secretary of State business reports. Maximum {maxSizeMb} MB.
          {fileName ? ` Selected: ${fileName}` : ""}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {busy && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex justify-between text-xs text-slate-500">
            <span>
              {phase === "uploading" ? "Uploading…" : "Validating & parsing…"}
            </span>
            {phase === "uploading" && <span>{progress}%</span>}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-500 transition-all"
              style={{
                width: phase === "processing" ? "100%" : `${progress}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button type="submit" loading={busy}>
          {busy ? "Working…" : "Upload & preview"}
        </Button>
      </div>
    </form>
  );
}
