import { afterEach, expect, it, vi } from "vitest";
import {
  createNotificationSound,
  NOTIFICATION_SOUND_URL,
} from "@/features/messages/notification-sound";

afterEach(() => vi.unstubAllGlobals());

it("操作時は音声の準備だけ行い、受信時に再生し、音源は一度だけ取得する", async () => {
  const start = vi.fn();
  const stop = vi.fn();
  const resume = vi.fn();
  const close = vi.fn(async () => {});
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      destination = {};
      resume = resume;
      close = close;
      decodeAudioData = vi.fn(async () => ({}));
      createBufferSource() {
        return { connect: vi.fn(), start, stop };
      }
    },
  );
  const fetchAudio = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(2),
  }));
  vi.stubGlobal("fetch", fetchAudio);
  const player = createNotificationSound();
  await player.play();
  expect(start).not.toHaveBeenCalled();
  expect(await player.unlock()).toBe(true);
  expect(await player.unlock()).toBe(true);
  expect(fetchAudio).toHaveBeenCalledExactlyOnceWith(NOTIFICATION_SOUND_URL);
  expect(start).not.toHaveBeenCalled();
  await player.play();
  await player.play();
  expect(start).toHaveBeenCalledTimes(2);
  expect(stop).toHaveBeenCalledTimes(1);
  player.dispose();
  await player.play();
  expect(await player.unlock()).toBe(false);
  expect(start).toHaveBeenCalledTimes(2);
  expect(close).toHaveBeenCalledTimes(1);
});

it("ブラウザが音声を拒否した場合も例外を外へ出さず、後の操作で再試行できる", async () => {
  const resume = vi.fn().mockRejectedValueOnce(new Error("blocked"));
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "suspended";
      async resume() {
        await resume();
        this.state = "running";
      }
      decodeAudioData = vi.fn(async () => ({}));
      close = vi.fn(async () => {});
    },
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(2),
    })),
  );
  const player = createNotificationSound();
  expect(await player.unlock()).toBe(false);
  await expect(player.play()).resolves.toBeUndefined();
  expect(await player.unlock()).toBe(true);
  player.dispose();
});
