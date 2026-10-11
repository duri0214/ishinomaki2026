"use client";

import { useCallback, useRef, useState } from "react";
import { ArtistDialog } from "./ArtistDialog";

/** GroupPhoto から島の slug を key にしてマウントする。対象が変わると開閉状態をリセットする。 */
export function ArtistProfileButton({
  slug,
  name,
}: {
  slug: string;
  name: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dismiss = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="absolute right-3 top-3 z-10">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${name}のプロフィールを表示`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="flex size-11 items-center justify-center rounded-full border border-white/60 bg-white/90 text-[#443354] shadow-sm backdrop-blur-sm hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#72519b]"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-6"
          fill="currentColor"
        >
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {isOpen && <ArtistDialog slug={slug} name={name} onDismiss={dismiss} />}
    </div>
  );
}
