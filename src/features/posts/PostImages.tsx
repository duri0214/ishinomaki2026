"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { PostImage } from "./image-limits";

export function PostImages({ images = [] }: { images?: PostImage[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<PostImage | null>(null);
  if (!images.length) return null;
  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {images.map((image, index) => (
          <button
            type="button"
            key={image.url}
            aria-label={`画像${index + 1}を拡大`}
            onClick={() => {
              setSelected(image);
              dialog.current?.showModal();
            }}
          >
            <Image
              src={image.url}
              alt={`添付画像${index + 1}`}
              width={image.width}
              height={image.height}
              sizes="(max-width: 640px) 45vw, 300px"
              className="aspect-[4/3] w-full rounded-lg bg-[var(--ui-hover)] object-contain"
            />
          </button>
        ))}
      </div>
      <dialog
        ref={dialog}
        aria-label="画像の拡大表示"
        className="m-auto max-h-[95vh] w-[min(95vw,1100px)] rounded-xl bg-white p-3 backdrop:bg-black/70"
      >
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="mb-2 rounded border px-3 py-1"
        >
          閉じる
        </button>
        {selected && (
          <Image
            src={selected.url}
            alt="拡大した添付画像"
            width={selected.width}
            height={selected.height}
            sizes="95vw"
            className="max-h-[80vh] w-full object-contain"
          />
        )}
      </dialog>
    </>
  );
}
