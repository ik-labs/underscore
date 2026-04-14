"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CreateProjectResponse = {
  id: string;
  name: string;
  createdAt: string;
  proseNamespaceId: string;
  sonicNamespaceId: string;
};

export function CreateProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Project name is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/project", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: trimmedName }),
      });

      const payload = (await response.json()) as
        | CreateProjectResponse
        | { error?: string; message?: string };

      if (!response.ok || !("id" in payload)) {
        const message =
          "message" in payload ? payload.message : undefined;
        setErrorMessage(message ?? "Failed to create project.");
        return;
      }

      router.push(`/project/${payload.id}`);
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to create project.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block space-y-2">
        <span className="text-xs uppercase tracking-[0.28em] text-emerald-200/75">
          Project name
        </span>
        <input
          className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-base text-stone-100 outline-none transition placeholder:text-stone-400/70 focus:border-emerald-300/60 focus:bg-black/30"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="The River"
          maxLength={80}
          disabled={isSubmitting}
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-stone-100 px-6 py-3 text-sm font-semibold text-stone-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Creating..." : "Start a project"}
        </button>
        <span className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-stone-100/85">
          Phase 1 project bootstrap
        </span>
      </div>

      {errorMessage ? (
        <p className="text-sm text-rose-200">{errorMessage}</p>
      ) : null}
    </form>
  );
}
