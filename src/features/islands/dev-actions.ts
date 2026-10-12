"use server";

import { revalidatePath } from "next/cache";
import { getDb, getTxDb } from "@/db";
import { type ActionResult, runAction } from "@/lib/action";
import { assertDevEditor } from "@/lib/dev-only";
import {
  createIsland,
  createTopicTag,
  type SaveIslandInput,
  saveIsland,
  setIslandBase,
} from "./admin";

/** 島エディタの Server Action。どれも開発環境でしか動かない（本番では forbidden） */

export async function createIslandAction(input: {
  slug: string;
  name: string;
  description?: string;
  base?: string;
}): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    assertDevEditor();
    const island = await createIsland(await getDb(), input);
    revalidatePath("/", "layout");
    return { slug: island.slug };
  });
}

export async function saveIslandAction(
  input: SaveIslandInput,
): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    assertDevEditor();
    const island = await saveIsland(await getTxDb(), input);
    // マップのデータは (main)/layout で取得しているので、レイアウトごと再取得させる
    revalidatePath("/", "layout");
    return { slug: island.slug };
  });
}

export async function setIslandBaseAction(
  slug: string,
  base: string,
): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    assertDevEditor();
    const island = await setIslandBase(await getDb(), slug, base);
    revalidatePath("/", "layout");
    return { slug: island.slug };
  });
}

export async function createTopicTagAction(
  slug: string,
  name: string,
): Promise<ActionResult<{ normalizedName: string }>> {
  return runAction(async () => {
    assertDevEditor();
    const tag = await createTopicTag(await getDb(), slug, name);
    revalidatePath("/", "layout");
    return tag;
  });
}
