"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center"
    >
      <p className="text-lg font-bold">うまく表示できませんでした</p>
      <p className="text-sm text-slate-600">
        通信状況を確認して、もう一度お試しください。
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-sky-600 px-4 py-1 text-sm font-bold text-white hover:bg-sky-700"
      >
        再読み込み
      </button>
    </div>
  );
}
