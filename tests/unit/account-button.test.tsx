// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const refresh = vi.fn();
const signOutAction = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/features/auth/AuthDialog", () => ({ useAuthDialog: () => vi.fn() }));
vi.mock("@/features/auth/viewer", () => ({
  useViewer: () => ({
    signedIn: true,
    user: { id: "u1", username: "neru", displayName: "ねる" },
  }),
}));
vi.mock("@/features/auth/actions", () => ({
  signOutAction: (...args: unknown[]) => signOutAction(...args),
}));

import { AccountButton } from "@/features/auth/AccountButton";
import { RELATED_USERS_KEY } from "@/features/related-users/constants";

beforeEach(() => {
  refresh.mockReset();
  signOutAction.mockReset().mockResolvedValue({ ok: true, data: null });
});

afterEach(() => cleanup());

it("ログアウトすると、そのユーザーの関連ユーザーをキャッシュから消し、タイムラインは取り直す", async () => {
  const client = new QueryClient();
  const relatedKey = [RELATED_USERS_KEY, "u1"];
  client.setQueryData(relatedKey, { users: [], hasCriteria: true });
  client.setQueryData(["timeline", null, null], { pages: [], pageParams: [] });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <AccountButton />
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole("button", { name: "アカウントメニュー" }));
  await user.click(screen.getByRole("menuitem", { name: "ログアウト" }));

  await waitFor(() => expect(signOutAction).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(client.getQueryData(relatedKey)).toBeUndefined());
  expect(refresh).toHaveBeenCalled();
  // タイムラインは消さずに、古いものとして取り直す
  expect(client.getQueryState(["timeline", null, null])?.isInvalidated).toBe(
    true,
  );
});
