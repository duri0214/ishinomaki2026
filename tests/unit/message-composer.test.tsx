// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MessageComposer } from "@/features/messages/MessageComposer";

const { send, openAuth } = vi.hoisted(() => ({
  send: vi.fn(),
  openAuth: vi.fn(),
}));
vi.mock("@/features/messages/actions", () => ({ sendMessageAction: send }));
vi.mock("@/features/auth/AuthDialog", () => ({
  useAuthDialog: () => openAuth,
}));
beforeEach(() => {
  send.mockReset();
  openAuth.mockReset();
});
afterEach(cleanup);

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(
    <QueryClientProvider client={client}>
      <MessageComposer conversationId="conversation" />
    </QueryClientProvider>,
  );
  return {
    client,
    invalidate,
    user: userEvent.setup(),
    textbox: screen.getByRole("textbox", {
      name: "メッセージの本文",
    }) as HTMLTextAreaElement,
  };
}

it("本文の上限と空白を検証し、成功時に履歴・会話一覧を更新する", async () => {
  const { user, textbox, invalidate } = setup();
  const submit = screen.getByRole("button", {
    name: "送信",
  }) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  fireEvent.change(textbox, { target: { value: "😀".repeat(281) } });
  expect(submit.disabled).toBe(true);
  expect(screen.getByText("281/280")).toBeTruthy();
  fireEvent.change(textbox, { target: { value: "秘密" } });
  send.mockResolvedValue({ ok: true, data: {} });
  await user.click(submit);
  expect(send).toHaveBeenCalledWith({
    conversationId: "conversation",
    body: "秘密",
  });
  await waitFor(() => expect(textbox.value).toBe(""));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["messages"] });
});

it("認証失敗や通信失敗でも本文を残し、ログインを促す", async () => {
  const { user, textbox } = setup();
  fireEvent.change(textbox, { target: { value: "消さない本文" } });
  send.mockResolvedValueOnce({
    ok: false,
    code: "unauthorized",
    message: "ログインが必要です",
  });
  await user.click(screen.getByRole("button", { name: "送信" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "ログインが必要です",
  );
  expect(textbox.value).toBe("消さない本文");
  expect(openAuth).toHaveBeenCalledWith({
    mode: "signin",
    reason: "ログインし直してください",
  });
  send.mockRejectedValueOnce(new Error("offline"));
  await user.click(screen.getByRole("button", { name: "送信" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain("通信状況"),
  );
  expect(textbox.value).toBe("消さない本文");
});

it("同じイベントループで送信を連打しても1回だけ送る", async () => {
  let resolve: (value: unknown) => void = () => {};
  send.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { textbox } = setup();
  fireEvent.change(textbox, { target: { value: "一通だけ" } });
  const form = textbox.closest("form");
  if (!form) throw new Error("form missing");
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  expect(send).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve({ ok: true, data: {} });
  });
});
