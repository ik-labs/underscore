"use client";

import type { SfxVariant } from "@/lib/project-types";

export function SfxSection({ sfxVariants }: { sfxVariants: SfxVariant[] }) {
  if (sfxVariants.length === 0) return null;

  return (
    <div className="mt-6">
      <p className="text-xs uppercase tracking-[0.28em] text-violet-200/70">
        Sound Effects
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {sfxVariants.map((sfx, i) => (
          <div
            key={i}
            className="flex flex-col rounded-[1.5rem] border border-violet-300/20 bg-violet-300/5 px-5 py-5"
          >
            <p className="text-xs text-stone-200/80 leading-5">{sfx.description}</p>
            <audio
              controls
              src={sfx.blobUrl}
              className="mt-4 w-full"
              preload="metadata"
            />
            <div className="mt-3">
              <a
                href={sfx.blobUrl}
                download={`sfx-${i + 1}.mp3`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/6 px-4 py-2 text-xs font-medium text-stone-100 transition hover:bg-white/10"
              >
                <span>↓</span>
                <span>Download</span>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
