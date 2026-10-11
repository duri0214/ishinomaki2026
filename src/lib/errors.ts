export type AppErrorCode =
  | "unauthorized"
  | "validation"
  | "island_not_found"
  | "post_not_found"
  | "forbidden";

/** 画面に出してよい、想定内のエラー */
export class AppError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}
