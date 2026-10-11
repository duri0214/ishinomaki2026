import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-bold">見つかりませんでした</p>
      <p className="text-sm text-slate-600">
        島やタグが存在しないか、URLが間違っているようです。
      </p>
      <Link
        href="/"
        className="rounded-full bg-sky-600 px-4 py-1 text-sm font-bold text-white hover:bg-sky-700"
      >
        世界地図へ戻る
      </Link>
    </div>
  );
}
