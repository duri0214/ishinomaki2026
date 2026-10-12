// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
const signUpAction = vi.fn();
const signInAction = vi.fn();
const updateProfileAction = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/auth/actions", () => ({
  signUpAction: (...args: unknown[]) => signUpAction(...args),
  signInAction: (...args: unknown[]) => signInAction(...args),
}));
vi.mock("@/features/profile/actions", () => ({
  updateProfileAction: (...args: unknown[]) => updateProfileAction(...args),
}));

import { AuthDialogProvider, useAuthDialog } from "@/features/auth/AuthDialog";
import { RELATED_USERS_KEY } from "@/features/related-users/constants";

const options = [
  {
    slug: "hoshizora",
    name: "星空シアター島",
    members: [
      { id: "m1", name: "みさき" },
      { id: "m2", name: "ひなた" },
    ],
  },
  { slug: "shiokaze", name: "潮風ガールズ島", members: [] },
];

function Opener() {
  const open = useAuthDialog();
  return (
    <button
      type="button"
      onClick={() => open({ reason: "いいねするにはアカウントが必要です" })}
    >
      開く
    </button>
  );
}

function renderDialog(client = new QueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <AuthDialogProvider profileOptions={options}>
        <Opener />
      </AuthDialogProvider>
    </QueryClientProvider>,
  );
}

const user = { id: "u1", username: "neru", displayName: "neru" };

beforeEach(() => {
  refresh.mockReset();
  signUpAction.mockReset();
  signInAction.mockReset();
  updateProfileAction.mockReset();
});

afterEach(() => cleanup());

describe("AuthDialog", () => {
  it("理由を添えて新規登録タブで開き、ログインタブへ切り替えられる。閉じるで消える", async () => {
    const u = userEvent.setup();
    renderDialog();
    expect(screen.queryByRole("dialog")).toBeNull();
    await u.click(screen.getByRole("button", { name: "開く" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("いいねするにはアカウントが必要です")).toBeTruthy();
    expect(
      screen.getByRole("tab", { name: "新規登録", selected: true }),
    ).toBeTruthy();
    expect(screen.getByText(/パスワードを忘れると/)).toBeTruthy();

    await u.click(screen.getByRole("tab", { name: "ログイン" }));
    expect(screen.getByRole("button", { name: "ログインする" })).toBeTruthy();
    expect(screen.queryByText(/パスワードを忘れると/)).toBeNull();

    await u.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("エラーを表示し、入力は残す", async () => {
    signUpAction.mockResolvedValueOnce({
      ok: false,
      code: "username_taken",
      message: "このユーザー名はすでに使われています",
    });
    const u = userEvent.setup();
    renderDialog();
    await u.click(screen.getByRole("button", { name: "開く" }));
    await u.type(screen.getByLabelText("ユーザー名"), "neru");
    await u.type(screen.getByLabelText("パスワード"), "password-1");
    await u.click(screen.getByRole("button", { name: "登録する" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "このユーザー名はすでに使われています",
    );
    expect(signUpAction).toHaveBeenCalledWith({
      username: "neru",
      password: "password-1",
    });
    expect(
      (screen.getByLabelText("ユーザー名") as HTMLInputElement).value,
    ).toBe("neru");
  });

  it("登録すると2ステップ目で推しを選べる。選んだ島のメンバーだけが送られる", async () => {
    signUpAction.mockResolvedValueOnce({ ok: true, data: user });
    updateProfileAction.mockResolvedValueOnce({ ok: true, data: null });
    const u = userEvent.setup();
    renderDialog();
    await u.click(screen.getByRole("button", { name: "開く" }));
    await u.type(screen.getByLabelText("ユーザー名"), "neru");
    await u.type(screen.getByLabelText("パスワード"), "password-1");
    await u.click(screen.getByRole("button", { name: "登録する" }));

    expect(
      await screen.findByRole("heading", { name: "推しを選ぶ" }),
    ).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
    expect((screen.getByLabelText("表示名") as HTMLInputElement).value).toBe(
      "neru",
    );

    // 島を選ぶまでメンバーは出ない
    expect(screen.queryByRole("button", { name: "ひなた" })).toBeNull();
    await u.click(screen.getByRole("checkbox", { name: "星空シアター島" }));
    await u.click(screen.getByRole("button", { name: "ひなた" }));
    await u.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateProfileAction).toHaveBeenCalledWith({
      displayName: "neru",
      favorites: [{ islandSlug: "hoshizora", memberTagIds: ["m2"] }],
    });
  });

  it("2ステップ目は「あとで」で閉じられる", async () => {
    signUpAction.mockResolvedValueOnce({ ok: true, data: user });
    const u = userEvent.setup();
    renderDialog();
    await u.click(screen.getByRole("button", { name: "開く" }));
    await u.type(screen.getByLabelText("ユーザー名"), "neru");
    await u.type(screen.getByLabelText("パスワード"), "password-1");
    await u.click(screen.getByRole("button", { name: "登録する" }));
    await u.click(await screen.findByRole("button", { name: "あとで" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(updateProfileAction).not.toHaveBeenCalled();
  });

  it("ログインに成功したら、2ステップ目には進まずに閉じる", async () => {
    signInAction.mockResolvedValueOnce({ ok: true, data: user });
    const u = userEvent.setup();
    renderDialog();
    await u.click(screen.getByRole("button", { name: "開く" }));
    await u.click(screen.getByRole("tab", { name: "ログイン" }));
    await u.type(screen.getByLabelText("ユーザー名"), "neru");
    await u.type(screen.getByLabelText("パスワード"), "password-1");
    await u.click(screen.getByRole("button", { name: "ログインする" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalled();
  });

  it("ログインに成功したら、前のユーザーの関連ユーザーをキャッシュから消す", async () => {
    signInAction.mockResolvedValueOnce({ ok: true, data: user });
    const client = new QueryClient();
    const key = [RELATED_USERS_KEY, "previous-user"];
    client.setQueryData(key, { users: [], hasCriteria: true });
    const u = userEvent.setup();
    renderDialog(client);
    await u.click(screen.getByRole("button", { name: "開く" }));
    await u.click(screen.getByRole("tab", { name: "ログイン" }));
    await u.type(screen.getByLabelText("ユーザー名"), "neru");
    await u.type(screen.getByLabelText("パスワード"), "password-1");
    await u.click(screen.getByRole("button", { name: "ログインする" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(client.getQueryData(key)).toBeUndefined();
  });
});
