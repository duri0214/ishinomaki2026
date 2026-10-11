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
      <p className="text-sm text-[#6a5c7d]">
        通信状況を確認して、もう一度お試しください。
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-[#8e6bb0] px-4 py-1 text-sm font-bold text-white hover:bg-[#7b5a9d]"
      >
        再読み込み
      </button>
    </div>
  );
}
