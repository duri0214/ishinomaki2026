export const NOTIFICATION_SOUND_URL = "/sounds/dm-notification.mp3";

/** ユーザー操作でAudioContextを開始する。受信時以外は音を出さない。 */
export function createNotificationSound() {
  let context: AudioContext | null = null;
  let buffer: Promise<AudioBuffer> | null = null;
  let source: AudioBufferSourceNode | null = null;
  let disposed = false;

  const unlock = async () => {
    if (disposed || typeof AudioContext === "undefined") return false;
    try {
      context ??= new AudioContext();
      const audioContext = context;
      if (audioContext.state !== "running") await audioContext.resume();
      buffer ??= fetch(NOTIFICATION_SOUND_URL)
        .then((r) => {
          if (!r.ok) throw new Error("通知音を読み込めませんでした");
          return r.arrayBuffer();
        })
        .then((bytes) => audioContext.decodeAudioData(bytes))
        .catch((error) => {
          buffer = null;
          throw error;
        });
      await buffer;
      return !disposed && context.state === "running";
    } catch {
      return false;
    }
  };

  return {
    unlock,
    async play() {
      if (disposed || !context || context.state !== "running" || !buffer)
        return;
      try {
        const audio = await buffer;
        if (disposed || context.state !== "running") return;
        source?.stop();
        source = context.createBufferSource();
        source.buffer = audio;
        source.connect(context.destination);
        source.start();
      } catch {
        /* 再生不可でも、バッジと新着取得は続ける。 */
      }
    },
    dispose() {
      disposed = true;
      source?.stop();
      if (context && context.state !== "closed")
        void context.close().catch(() => {});
    },
  };
}
