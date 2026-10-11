import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-bold">見つかりませんでした</p>
      <p className="text-sm text-[#6a5c7d]">
        島やタグが存在しないか、URLが間違っているようです。
      </p>
      <Link
        href="/"
        className="rounded-full bg-[#8e6bb0] px-4 py-1 text-sm font-bold text-white hover:bg-[#7b5a9d]"
      >
        世界地図へ戻る
      </Link>
    </div>
  );
}
