"use client";

import Image from "next/image";
import type { Design } from "@/features/design/design";
import { useDesign } from "@/features/design/useDesign";

/** 選択中のデザインに合わせた横長ロゴ。public/logos の寸法に合わせる */
const HORIZONTAL_LOGOS: Record<
  Design,
  { src: string; width: number; height: number }
> = {
  kawaii: { src: "/logos/horizontal-kawaii.png", width: 960, height: 328 },
  cool: { src: "/logos/horizontal-cool.png", width: 960, height: 335 },
};

export function HorizontalLogo({ className }: { className?: string }) {
  const { design } = useDesign();
  const logo = HORIZONTAL_LOGOS[design];
  return (
    <Image
      key={design}
      src={logo.src}
      alt="oshimarin"
      width={logo.width}
      height={logo.height}
      sizes="14rem"
      loading="eager"
      className={className}
    />
  );
}
