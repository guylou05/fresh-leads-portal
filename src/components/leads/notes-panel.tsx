"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { NOTE_MAX_LENGTH } from "@/lib/leads/constants";
import {
  addNote,
  deleteNote,
  editNote,
  setNotePinned,
} from "@/app/(app)/leads/actions";
import { formatDateTime } from "@/lib/utils";

export type NoteItem = {
  id: string;
  body: string;
  isPinned: boolean;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  canModify: boolean;
};

export function NotesPanel({
  businessRecordId,
  notes,
}: {
  businessRecordId: string;
  notes: NoteItem[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");

  function refreshWith(result: { ok: boolean; error?: string; message?: string }) {
    if (result.ok) {
      toast(result.message ?? "Done.", "success");
      router.refresh();
    } else {
      toast(result.error ?? "Action failed.", "error");
    }
  }

  function submitNew() {
    if (!body.trim()) {
      toast("Note cannot be empty.", "error");
      return;
    }
    startTransition(async () => {
      const result = await addNote(businessRecordId, body);
      refreshWith(result);
      if (result.ok) setBody("");
    });
  }

  function saveEdit(id: string) {
    startTransition(async () => {
      const result = await editNote(id, editingBody);
      refreshWith(result);
      if (result.ok) setEditingId(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 p-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          placeholder="Add a note about this lead…"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <div className="mt-2 flex justify-end">
          <Button onClick={submitNew} loading={isPending}>
            Add note
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-slate-400">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className={`rounded-lg border p-4 ${note.isPinned ? "border-brand-200 bg-brand-50" : "border-slate-200"}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {note.authorName}
                  </span>{" "}
                  · {formatDateTime(note.createdAt)}
                  {note.updatedAt !== note.createdAt && " · edited"}
                  {note.isPinned && (
                    <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-brand-700">
                      Pinned
                    </span>
                  )}
                </div>
                {note.canModify && (
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      className="text-slate-500 hover:text-slate-700"
                      onClick={() =>
                        startTransition(async () =>
                          refreshWith(await setNotePinned(note.id, !note.isPinned)),
                        )
                      }
                    >
                      {note.isPinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      className="text-slate-500 hover:text-slate-700"
                      onClick={() => {
                        setEditingId(note.id);
                        setEditingBody(note.body);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => {
                        if (window.confirm("Delete this note?"))
                          startTransition(async () =>
                            refreshWith(await deleteNote(note.id)),
                          );
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              {editingId === note.id ? (
                <div className="mt-2">
                  <textarea
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    rows={3}
                    maxLength={NOTE_MAX_LENGTH}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" onClick={() => saveEdit(note.id)} loading={isPending}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  {note.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
