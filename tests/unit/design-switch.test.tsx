// @vitest-environment jsdom
import { runInNewContext } from "node:vm";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesignSwitch } from "@/features/design/DesignSwitch";
import {
  DEFAULT_DESIGN,
  DESIGN_INIT_SCRIPT,
  DESIGN_STORAGE_KEY,
} from "@/features/design/design";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.dataset.design = DEFAULT_DESIGN;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.design;
});

const control = () => screen.getByRole("switch", { name: "かわいいデザイン" });

describe("DesignSwitch", () => {
  it.each([
    [null, "kawaii"],
    ["cool", "cool"],
    ["kawaii", "kawaii"],
    ["invalid", "kawaii"],
  ])("保存値 %s を初回描画前に %s として復元する", (saved, expected) => {
    if (saved !== null) window.localStorage.setItem(DESIGN_STORAGE_KEY, saved);
    runInNewContext(DESIGN_INIT_SCRIPT, {
      document,
      localStorage: window.localStorage,
    });
    expect(document.documentElement.dataset.design).toBe(expected);
  });

  it("保存値を読み取れなくても既定値で起動する", () => {
    runInNewContext(DESIGN_INIT_SCRIPT, {
      document,
      localStorage: {
        getItem() {
          throw new DOMException("読み取り不可", "SecurityError");
        },
      },
    });
    expect(document.documentElement.dataset.design).toBe(DEFAULT_DESIGN);
  });

  it("サーバー描画後に保存済みの選択を復元してもhydrationエラーにならない", async () => {
    const errors = vi.spyOn(console, "error");
    const container = document.createElement("div");
    container.innerHTML = renderToString(<DesignSwitch />);
    document.body.append(container);
    window.localStorage.setItem(DESIGN_STORAGE_KEY, "cool");
    runInNewContext(DESIGN_INIT_SCRIPT, {
      document,
      localStorage: window.localStorage,
    });

    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <DesignSwitch />);
      });
      expect(control().getAttribute("aria-checked")).toBe("false");
      expect(errors).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("初回描画前に復元された選択を表示する", () => {
    document.documentElement.dataset.design = "cool";
    render(<DesignSwitch />);
    expect(control().getAttribute("aria-checked")).toBe("false");
    expect(control().textContent).toBe("かっこいい");
  });

  it("クリックとキーボードで切り替え、選択を保存する", async () => {
    const user = userEvent.setup();
    render(<DesignSwitch />);
    expect(control().getAttribute("aria-checked")).toBe("true");

    await user.click(control());
    expect(document.documentElement.dataset.design).toBe("cool");
    expect(window.localStorage.getItem(DESIGN_STORAGE_KEY)).toBe("cool");
    expect(control().getAttribute("aria-checked")).toBe("false");

    await user.keyboard(" ");
    expect(document.documentElement.dataset.design).toBe("kawaii");
    expect(window.localStorage.getItem(DESIGN_STORAGE_KEY)).toBe("kawaii");
    await user.keyboard("{Enter}");
    expect(document.documentElement.dataset.design).toBe("cool");
  });

  it("ストレージに保存できなくても切り替えられる", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("保存不可", "SecurityError");
    });
    const user = userEvent.setup();
    render(<DesignSwitch />);
    await user.click(control());
    expect(document.documentElement.dataset.design).toBe("cool");
    expect(control().getAttribute("aria-checked")).toBe("false");
  });

  it("別タブの変更を反映し、削除・不正な値は既定値に戻す", () => {
    render(<DesignSwitch />);
    for (const [newValue, expected] of [
      ["cool", "false"],
      ["invalid", "true"],
      ["cool", "false"],
      [null, "true"],
    ]) {
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", { key: DESIGN_STORAGE_KEY, newValue }),
        );
      });
      expect(control().getAttribute("aria-checked")).toBe(expected);
    }
  });
});
