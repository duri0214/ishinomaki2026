"use client";

import { useDesign } from "./useDesign";

export function DesignSwitch() {
  const { design, setDesign } = useDesign();
  return (
    <fieldset aria-label="デザイン" className="design-options">
      {(
        [
          ["cool", "かっこいい"],
          ["kawaii", "かわいい"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={design === value}
          onClick={() => setDesign(value)}
          className="design-option"
        >
          <span aria-hidden="true">{value === "cool" ? "◇" : "♡"}</span>
          {label}
        </button>
      ))}
    </fieldset>
  );
}
