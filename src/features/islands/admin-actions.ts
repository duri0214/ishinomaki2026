"use server";

import { revalidatePath } from "next/cache";
import { getDb, getTxDb } from "@/db";
import {
  type SaveIslandTraitsInput,
  saveIslandTraits,
  type TraitScores,
} from "@/features/traits/service";
import { type ActionResult, runAction } from "@/lib/action";
import { requireAdminUser } from "@/lib/admin";
import {
  createIsland,
  type SaveIslandInput,
  type SaveTopicInput,
  saveIsland,
  saveTopic,
} from "./admin";

function revalidateManagedData() {
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
}

export async function createAdminIslandAction(input: {
  slug: string;
  name: string;
  description?: string;
}): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    await requireAdminUser();
    const island = await createIsland(await getDb(), input);
    revalidateManagedData();
    return { slug: island.slug };
  });
}

export async function saveAdminIslandAction(
  input: SaveIslandInput,
): Promise<ActionResult<{ slug: string }>> {
  return runAction(async () => {
    await requireAdminUser();
    const island = await saveIsland(await getTxDb(), input);
    revalidateManagedData();
    return { slug: island.slug };
  });
}

export async function saveAdminTopicAction(
  input: SaveTopicInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await requireAdminUser();
    const topic = await saveTopic(await getTxDb(), input);
    revalidateManagedData();
    return { id: topic.id };
  });
}

export async function saveAdminIslandTraitsAction(
  input: SaveIslandTraitsInput,
): Promise<ActionResult<TraitScores>> {
  return runAction(async () => {
    await requireAdminUser();
    const traits = await saveIslandTraits(await getTxDb(), input);
    revalidateManagedData();
    return traits;
  });
}
