"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_DESIGN,
  DESIGN_STORAGE_KEY,
  type Design,
  isDesign,
} from "./design";

const DESIGN_CHANGE_EVENT = "ishinomaki-design-change";
let unsavedSelection:
  | { design: Design; storedValue: string | null | undefined }
  | undefined;

function getDesign(): Design {
  const value = document.documentElement.dataset.design;
  return isDesign(value) ? value : DEFAULT_DESIGN;
}

function getServerDesign(): Design {
  return DEFAULT_DESIGN;
}

function readStoredValue(): string | null | undefined {
  try {
    return window.localStorage.getItem(DESIGN_STORAGE_KEY);
  } catch {
    return undefined;
  }
}

function syncStoredDesign() {
  const storedValue = readStoredValue();
  if (storedValue === undefined) return;
  // 保存に失敗した場合、保存値が変わっていなければページ内の選択を保つ。
  if (
    unsavedSelection?.design === getDesign() &&
    unsavedSelection.storedValue === storedValue
  ) {
    return;
  }
  unsavedSelection = undefined;
  const design = isDesign(storedValue) ? storedValue : DEFAULT_DESIGN;
  if (design === getDesign()) return;
  document.documentElement.dataset.design = design;
  window.dispatchEvent(new Event(DESIGN_CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== DESIGN_STORAGE_KEY && event.key !== null) return;
    try {
      if (event.storageArea !== window.localStorage) return;
    } catch {
      return;
    }
    // 通知は遅れて届く場合があるため、newValueではなく現在の保存値を読む。
    syncStoredDesign();
  };

  window.addEventListener(DESIGN_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  // 画面遷移やActivityで購読が止まっていた間の変更も取り込む。
  syncStoredDesign();
  return () => {
    window.removeEventListener(DESIGN_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function setDesign(design: Design) {
  const storedValue = readStoredValue();
  document.documentElement.dataset.design = design;
  try {
    window.localStorage.setItem(DESIGN_STORAGE_KEY, design);
    unsavedSelection = undefined;
  } catch {
    // 保存が禁止されていても、このページ内での切り替えは利用できる。
    unsavedSelection = { design, storedValue };
  }
  window.dispatchEvent(new Event(DESIGN_CHANGE_EVENT));
}

/** 全画面で共有する選択。子コンポーネントやマップを再マウントしない。 */
export function useDesign() {
  const design = useSyncExternalStore(subscribe, getDesign, getServerDesign);
  return { design, setDesign };
}
