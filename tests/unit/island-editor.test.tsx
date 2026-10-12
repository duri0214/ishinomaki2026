// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IslandEditor } from "@/features/islands/IslandEditor";
import type { MapIslandData } from "@/features/map/types";

const refresh = vi.fn();
const saveAction = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/map/MapCanvas", () => ({
  MapCanvas: () => null,
}));

const island: MapIslandData = {
  id: "island-1",
  slug: "sample",
  name: "サンプル島",
  imageUrl: null,
  worldX: 0,
  worldY: 0,
  members: [],
  topTags: [],
};

beforeEach(() => {
  refresh.mockReset();
  saveAction.mockReset();
  saveAction.mockResolvedValue({ ok: true, data: { slug: island.slug } });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IslandEditor", () => {
  it("crypto.randomUUID がないブラウザでもメンバーを追加して保存できる", async () => {
    vi.stubGlobal("crypto", {});
    const user = userEvent.setup();
    render(
      <IslandEditor
        island={island}
        initialDescription=""
        allIslands={[island]}
        saveAction={saveAction}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: "追加するメンバー名" }),
      "新メンバー",
    );
    await user.click(screen.getByRole("button", { name: "追加" }));
    expect(
      (screen.getByRole("textbox", { name: "メンバー名" }) as HTMLInputElement)
        .value,
    ).toBe("新メンバー");

    await user.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() =>
      expect(saveAction).toHaveBeenCalledWith(
        expect.objectContaining({
          members: [{ name: "新メンバー", x: 0, y: 0 }],
        }),
      ),
    );
  });
});
