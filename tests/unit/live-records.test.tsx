// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LiveRecords } from "@/features/live/LiveRecords";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/live/actions", () => ({
  saveLiveRecordAction: vi.fn().mockResolvedValue({ ok: true }),
  deleteLiveRecordAction: vi.fn().mockResolvedValue({ ok: true }),
}));
afterEach(cleanup);
it("編集フォームは対象のカード内に開き、キャンセルで元のメモに戻る", async () => {
  const user = userEvent.setup();
  render(
    <LiveRecords
      ownerId="test-user"
      data={{
        favorites: [],
        events: [
          {
            id: "event",
            islandSlug: "idol",
            islandName: "アイドル",
            title: "公演",
            venue: "会場",
            startsAt: "2026-10-01T00:00:00Z",
          },
        ],
        records: [{ eventId: "event", note: "元の思い出" }],
      }}
    />,
  );
  const card = screen.getByRole("listitem");
  await user.click(within(card).getByRole("button", { name: "記録を編集" }));
  expect(
    within(card).getByRole("button", { name: "変更内容を保存" }),
  ).toBeTruthy();
  expect(within(card).getByRole("button", { name: "削除" })).toBeTruthy();
  await user.clear(within(card).getByRole("textbox"));
  await user.type(within(card).getByRole("textbox"), "変更中のメモ");
  await user.click(within(card).getByRole("button", { name: "キャンセル" }));
  expect(within(card).queryByRole("textbox")).toBeNull();
  expect(within(card).getByText("元の思い出")).toBeTruthy();
  await user.click(within(card).getByRole("button", { name: "記録を編集" }));
  expect((within(card).getByRole("textbox") as HTMLTextAreaElement).value).toBe(
    "元の思い出",
  );
});

it("アイドル別に開閉でき、公演を新しい順に並べ、色を個別に保持する", async () => {
  localStorage.clear();
  const user = userEvent.setup();
  const events = [
    {
      id: "old",
      islandSlug: "a",
      islandName: "アイドルA",
      title: "春公演",
      venue: "会場",
      startsAt: "2026-04-01T00:00:00Z",
    },
    {
      id: "other",
      islandSlug: "b",
      islandName: "アイドルB",
      title: "夏公演",
      venue: "会場",
      startsAt: "2026-08-01T00:00:00Z",
    },
    {
      id: "new",
      islandSlug: "a",
      islandName: "アイドルA",
      title: "秋公演",
      venue: "会場",
      startsAt: "2026-10-01T00:00:00Z",
    },
  ];
  const data = {
    favorites: [],
    events,
    records: events.map((e) => ({ eventId: e.id, note: "" })),
  };
  const view = render(<LiveRecords ownerId="fan" data={data} />);
  const a = screen.getByRole("list", { name: "アイドルAの参戦記録" });
  expect(
    within(a)
      .getAllByRole("listitem")
      .map((e) => e.textContent?.slice(0, 3)),
  ).toEqual(["秋公演", "春公演"]);
  const b = screen.getByRole("list", { name: "アイドルBの参戦記録" });
  const before = within(b).getByRole("listitem").style.backgroundColor;
  await user.selectOptions(
    screen.getByLabelText("アイドルAの公演カードの色"),
    "#fce7ef",
  );
  expect(within(a).getAllByRole("listitem")[0]?.style.backgroundColor).toBe(
    "rgb(252, 231, 239)",
  );
  expect(within(b).getByRole("listitem").style.backgroundColor).toBe(before);
  const details = a.closest("details") as HTMLDetailsElement;
  await user.click(details.querySelector("summary") as HTMLElement);
  expect(details.open).toBe(false);
  await user.click(details.querySelector("summary") as HTMLElement);
  expect(details.open).toBe(true);
  view.unmount();
  render(<LiveRecords ownerId="fan" data={data} />);
  expect(
    (screen.getByLabelText("アイドルAの公演カードの色") as HTMLSelectElement)
      .value,
  ).toBe("#fce7ef");
});
