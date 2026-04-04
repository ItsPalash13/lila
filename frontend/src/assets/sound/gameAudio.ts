import clickSrc from "./click.mp3";
import lostSrc from "./level_lost.mp3";
import wonSrc from "./level_won.mp3";

function playClip(src: string, volume: number): void {
  try {
    const a = new Audio(src);
    a.volume = Math.min(1, Math.max(0, volume));
    void a.play().catch(() => {
      /* autoplay policy or missing decode */
    });
  } catch {
    /* ignore */
  }
}

/** Short UI feedback (move, buttons). */
export function playUiClick(): void {
  playClip(clickSrc, 0.38);
}

/** Match just went from waiting → playing (both seats filled). */
export function playMatchStarted(): void {
  playClip(clickSrc, 0.22);
}

export function playGameWin(): void {
  playClip(wonSrc, 0.52);
}

export function playGameLose(): void {
  playClip(lostSrc, 0.48);
}

/** No asset for draw — short neutral tone via Web Audio. */
export function playGameDraw(): void {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) {
      return;
    }
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(392, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.24);
    void ctx.resume().catch(() => {});
  } catch {
    /* ignore */
  }
}
