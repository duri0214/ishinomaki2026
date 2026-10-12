"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  IMAGE_ACCEPT,
  MAX_IMAGES,
  MAX_TOTAL_IMAGE_BYTES,
} from "./image-limits";

export function validateSelection(files: File[]): string | null {
  if (files.length > MAX_IMAGES) return "画像は4枚まで添付できます";
  if (files.some((file) => !IMAGE_ACCEPT.split(",").includes(file.type)))
    return "JPEG・PNG・WebPの画像を選んでください";
  if (
    files.some((file) => !file.size) ||
    files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_IMAGE_BYTES
  )
    return "画像の合計サイズは4MB以内にしてください";
  return null;
}

export function ImagePicker({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
}) {
  const [photoLibraryAvailable, setPhotoLibraryAvailable] = useState(false);
  useEffect(() => {
    // 写真ライブラリの有無を調べるWeb APIはないため、モバイルOSを基に判断する。
    // iPadOSのデスクトップ表示ではMacIntelとして報告される。
    setPhotoLibraryAvailable(
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
  }, []);
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        menu.current &&
        !menu.current.contains(event.target)
      ) {
        menu.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () =>
      document.removeEventListener("pointerdown", closeOutside, true);
  }, []);
  const photos = useRef<HTMLInputElement>(null);
  const documents = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [files]);
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2 text-xs text-[var(--ui-accent)]">
        {photoLibraryAvailable ? (
          <details
            ref={menu}
            className="relative"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }
            }}
          >
            <summary
              aria-disabled={disabled}
              className="cursor-pointer list-none rounded-[var(--ui-radius-inner)] border border-[var(--ui-border)] px-3 py-2 font-bold hover:bg-[var(--ui-hover)] [&::-webkit-details-marker]:hidden"
            >
              写真をアップロード <span aria-hidden="true">▾</span>
            </summary>
            <div className="absolute left-0 top-full z-30 mt-1 min-w-44 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface,#fff)] p-1 shadow-lg">
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                  photos.current?.click();
                }}
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--ui-hover)]"
              >
                写真から選択
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (menu.current) menu.current.open = false;
                  documents.current?.click();
                }}
                className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--ui-hover)]"
              >
                ファイルから選択
              </button>
            </div>
          </details>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => documents.current?.click()}
            className="rounded-[var(--ui-radius-inner)] border border-[var(--ui-border)] px-3 py-2 font-bold hover:bg-[var(--ui-hover)]"
          >
            ファイルからアップロード
          </button>
        )}
        <input
          ref={photos}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple
          hidden
          aria-label="写真を添付"
          disabled={disabled}
          onChange={(e) => {
            onChange([...files, ...Array.from(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <input
          ref={documents}
          type="file"
          accept=".jpg,.jpeg,.png,.webp"
          multiple
          hidden
          aria-label="ファイルを添付"
          disabled={disabled}
          onChange={(e) => {
            onChange([...files, ...Array.from(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      <p className="my-2 text-xs text-[var(--ui-muted)]">
        画像をここへドラッグ＆ドロップできます（最大4枚・合計4MB、JPEG / PNG /
        WebP）
      </p>
      <div className="grid grid-cols-2 gap-2">
        {files.map((file, index) => (
          <div key={previews[index] ?? index} className="relative">
            {previews[index] && (
              <Image
                src={previews[index]}
                alt={`添付予定: ${file.name}`}
                width={240}
                height={180}
                unoptimized
                className="aspect-[4/3] w-full rounded-lg object-contain bg-[var(--ui-hover)]"
              />
            )}
            <button
              type="button"
              disabled={disabled}
              aria-label={`画像${index + 1}を外す`}
              onClick={() => onChange(files.filter((_, i) => i !== index))}
              className="absolute right-1 top-1 rounded-full bg-white px-2 py-1 text-sm text-black"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
