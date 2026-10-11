"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import {
  ProfileEditor,
  type ProfileIslandOption,
} from "@/features/profile/ProfileEditor";
import { signInAction, signUpAction } from "./actions";
import { PASSWORD_MIN, USERNAME_MAX, USERNAME_MIN } from "./validation";

type Mode = "signup" | "signin";

export type OpenAuthDialog = (options?: {
  mode?: Mode;
  /** モーダル上部に出す一文（例: いいねするにはアカウントが必要です） */
  reason?: string;
}) => void;

const AuthDialogContext = createContext<OpenAuthDialog>(() => {});
const ProfileOptionsContext = createContext<ProfileIslandOption[]>([]);

/** 推しの候補（島とメンバー）。プロフィールの編集でも使う */
export function useProfileOptions(): ProfileIslandOption[] {
  return useContext(ProfileOptionsContext);
}

/** 登録・ログインのモーダルを開く関数を返す */
export function useAuthDialog(): OpenAuthDialog {
  return useContext(AuthDialogContext);
}

type State =
  | { step: "closed" }
  | { step: "credentials"; mode: Mode; reason?: string }
  | { step: "favorites"; displayName: string };

export function AuthDialogProvider({
  profileOptions,
  children,
}: {
  profileOptions: ProfileIslandOption[];
  children: React.ReactNode;
}) {
  const [state, setState] = useState<State>({ step: "closed" });
  const open = useCallback<OpenAuthDialog>((options) => {
    setState({
      step: "credentials",
      mode: options?.mode ?? "signup",
      reason: options?.reason,
    });
  }, []);
  const close = useCallback(() => setState({ step: "closed" }), []);

  return (
    <AuthDialogContext.Provider value={open}>
      <ProfileOptionsContext.Provider value={profileOptions}>
        {children}
      </ProfileOptionsContext.Provider>
      {state.step !== "closed" && (
        <AuthDialog
          state={state}
          setState={setState}
          onClose={close}
          profileOptions={profileOptions}
        />
      )}
    </AuthDialogContext.Provider>
  );
}

function AuthDialog({
  state,
  setState,
  onClose,
  profileOptions,
}: {
  state: Exclude<State, { step: "closed" }>;
  setState: (s: State) => void;
  onClose: () => void;
  profileOptions: ProfileIslandOption[];
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // showModal でフォーカスの閉じ込めと Esc で閉じる動作をブラウザに任せる（jsdom には無い）
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
    };
  }, []);

  /** ログイン状態が変わったので、サーバーの描画とタイムライン（いいね済み・削除ボタン）を取り直す */
  const refresh = useCallback(() => {
    router.refresh();
    queryClient.invalidateQueries({ queryKey: ["timeline"] });
  }, [router, queryClient]);

  const title =
    state.step === "favorites"
      ? "推しを選ぶ"
      : state.mode === "signup"
        ? "アカウントを作成"
        : "ログイン";

  return (
    // 背景のクリックで閉じる操作は補助。キーボードでは Esc（onCancel）と閉じるボタンで閉じられる
    // biome-ignore lint/a11y/useKeyWithClickEvents: Esc は dialog の cancel イベントで扱う
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // 背景（dialog 自身）をクリックしたら閉じる
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-[28px] bg-[#fffcf8] p-0 text-[#3f3158] shadow-2xl backdrop:bg-[#2b2140]/50"
    >
      <div className="flex max-h-[85dvh] flex-col gap-4 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 id={titleId} className="font-serif text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex size-8 items-center justify-center rounded-full text-[#a79bb8] hover:bg-[#f6f0fa]"
          >
            ×
          </button>
        </div>

        {state.step === "credentials" ? (
          <>
            {state.reason && (
              <p className="rounded-2xl bg-[#f6f0fa] px-3 py-2 text-sm text-[#6a5c7d]">
                {state.reason}
              </p>
            )}
            <div
              role="tablist"
              aria-label="登録またはログイン"
              className="grid grid-cols-2 rounded-full bg-[#f1eaf6] p-1 text-sm font-bold"
            >
              {(
                [
                  ["signup", "新規登録"],
                  ["signin", "ログイン"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={state.mode === mode}
                  onClick={() => setState({ ...state, mode })}
                  className={`rounded-full py-1.5 transition-colors ${
                    state.mode === mode
                      ? "bg-white text-[#3f3158] shadow-sm"
                      : "text-[#8a7ca0]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <CredentialsForm
              key={state.mode}
              mode={state.mode}
              onDone={(user) => {
                refresh();
                if (state.mode === "signup") {
                  setState({
                    step: "favorites",
                    displayName: user.displayName,
                  });
                } else {
                  onClose();
                }
              }}
            />
          </>
        ) : (
          <>
            <p className="text-sm text-[#6a5c7d]">
              アカウントを作成しました。推しを選ぶとプロフィールに表示されます（あとからでも変えられます）。
            </p>
            <ProfileEditor
              options={profileOptions}
              initial={{ displayName: state.displayName, favorites: [] }}
              cancelLabel="あとで"
              onCancel={onClose}
              onSaved={() => {
                refresh();
                onClose();
              }}
            />
          </>
        )}
      </div>
    </dialog>
  );
}

function CredentialsForm({
  mode,
  onDone,
}: {
  mode: Mode;
  onDone: (user: { displayName: string }) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const signup = mode === "signup";

  const submit = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const action = signup ? signUpAction : signInAction;
      const result = await action({ username, password });
      if (result.ok) onDone(result.data);
      else setError(result.message);
    } catch {
      setError("うまくいきませんでした。通信状況を確認してください");
    } finally {
      setPending(false);
    }
  };

  const hints = {
    username: `半角英数字と _ で${USERNAME_MIN}〜${USERNAME_MAX}文字`,
    password: `${PASSWORD_MIN}文字以上`,
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field
        label="ユーザー名"
        hint={signup ? hints.username : undefined}
        name="username"
        value={username}
        onChange={setUsername}
        autoComplete="username"
      />
      <Field
        label="パスワード"
        hint={signup ? hints.password : undefined}
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete={signup ? "new-password" : "current-password"}
      />
      {signup && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          メールアドレスを登録しないため、パスワードを忘れるとアカウントを復旧できません。
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[#8e6bb0] py-2 text-sm font-bold text-white hover:bg-[#7b5a9d] disabled:bg-[#d9cfe4]"
      >
        {pending ? "送信中…" : signup ? "登録する" : "ログインする"}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  name,
  type = "text",
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  hint?: string;
  name: string;
  type?: "text" | "password";
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-bold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="rounded-xl border border-[#e2d7ea] bg-[#faf6fb] px-3 py-2 text-[15px] outline-none focus:ring-2 focus:ring-[#c9a5e0]"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-[#a79bb8]">
          {hint}
        </p>
      )}
    </div>
  );
}
