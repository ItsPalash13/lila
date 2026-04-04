import { useEffect, useState } from "react";

/**
 * Viewport buckets aligned with common Tailwind-style defaults.
 * - xs: under 480px
 * - sm: 480px–767px
 * - md: 768px and up
 */
export type Breakpoint = "xs" | "sm" | "md";

const MQ_SM = "(min-width: 480px)";
const MQ_MD = "(min-width: 768px)";

function readBreakpoint(): Breakpoint {
  if (typeof window === "undefined") {
    return "md";
  }
  if (window.matchMedia(MQ_MD).matches) {
    return "md";
  }
  if (window.matchMedia(MQ_SM).matches) {
    return "sm";
  }
  return "xs";
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(readBreakpoint);

  useEffect(() => {
    const mqSm = window.matchMedia(MQ_SM);
    const mqMd = window.matchMedia(MQ_MD);
    const sync = () => setBp(readBreakpoint());
    mqSm.addEventListener("change", sync);
    mqMd.addEventListener("change", sync);
    sync();
    return () => {
      mqSm.removeEventListener("change", sync);
      mqMd.removeEventListener("change", sync);
    };
  }, []);

  return bp;
}
