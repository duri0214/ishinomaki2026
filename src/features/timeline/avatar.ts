/** アイコンの色。表示名から決めるので、同じ人はいつも同じ色になる */
const AVATARS = [
  "from-[#c9a5e0] to-[#8f6ab3]",
  "from-[#f0b6c8] to-[#c97b9b]",
  "from-[#f3c7a6] to-[#d58f6a]",
  "from-[#a9c4ec] to-[#6f8fc9]",
  "from-[#b4d9c4] to-[#6fa88a]",
] as const;

export function avatarClass(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AVATARS[hash % AVATARS.length] ?? AVATARS[0];
}
