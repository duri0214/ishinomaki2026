"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_DESIGN,
  DESIGN_STORAGE_KEY,
  type Design,
  isDesign,
} from "./design";

const DESIGN_CHANGE_EVENT = "ishinomaki-design-change";

function getDesign(): Design {
  const value = document.documentElement.dataset.design;
  return isDesign(value) ? value : DEFAULT_DESIGN;
}

function getServerDesign(): Design {
  return DEFAULT_DESIGN;
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== DESIGN_STORAGE_KEY && event.key !== null) return;
    const design = isDesign(event.newValue) ? event.newValue : DEFAULT_DESIGN;
    document.documentElement.dataset.design = design;
    onChange();
  };

  window.addEventListener(DESIGN_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(DESIGN_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function setDesign(design: Design) {
  document.documentElement.dataset.design = design;
  try {
    window.localStorage.setItem(DESIGN_STORAGE_KEY, design);
  } catch {
    // 保存が禁止されていても、このページ内での切り替えは利用できる。
  }
  window.dispatchEvent(new Event(DESIGN_CHANGE_EVENT));
}

/** 全画面で共有する選択。子コンポーネントやマップを再マウントしない。 */
export function useDesign() {
  const design = useSyncExternalStore(subscribe, getDesign, getServerDesign);
  return { design, setDesign };
}
