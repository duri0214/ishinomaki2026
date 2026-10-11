"use client";

import { useDesign } from "./useDesign";

export function DesignSwitch() {
  const { design, setDesign } = useDesign();
  const kawaii = design === "kawaii";

  return (
    <button
      type="button"
      role="switch"
      aria-label="かわいいデザイン"
      aria-checked={kawaii}
      title={`${kawaii ? "かっこいい" : "かわいい"}デザインに切り替え`}
      onClick={() => setDesign(kawaii ? "cool" : "kawaii")}
      className="flex h-11 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg text-[#e7def5] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 rounded-full transition-colors motion-reduce:transition-none ${kawaii ? "bg-[#b9aed0]" : "bg-[#3d3157]"}`}
      >
        <span
          className={`absolute left-1 top-1 size-4 rounded-full bg-[#fffcf8] shadow-sm transition-transform motion-reduce:transition-none ${kawaii ? "translate-x-5" : "translate-x-0"}`}
        />
      </span>
      <span aria-hidden="true" className="text-[10px] font-medium leading-3">
        {kawaii ? "かわいい" : "かっこいい"}
      </span>
    </button>
  );
}
