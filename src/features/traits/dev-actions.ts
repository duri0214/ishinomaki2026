"use server";

import { getTxDb } from "@/db";
import { type ActionResult, runAction } from "@/lib/action";
import { assertDevEditor } from "@/lib/dev-only";
import {
  type SaveIslandTraitsInput,
  saveIslandTraits,
  type TraitScores,
} from "./service";

/** 傾向タグのデバッグツールの Server Action。開発環境でしか動かない（本番では forbidden） */

export async function saveIslandTraitsAction(
  input: SaveIslandTraitsInput,
): Promise<ActionResult<TraitScores>> {
  return runAction(async () => {
    assertDevEditor();
    return saveIslandTraits(await getTxDb(), input);
  });
}
