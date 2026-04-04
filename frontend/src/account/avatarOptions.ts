/**
 * Bundled avatars under `src/assets/avatars/`. Add PNG/SVG/WebP files there;
 * they are picked up automatically at build time.
 *
 * We store `lila-asset:<filename>` in Nakama `avatar_url` so the value is
 * stable across Vite hashes; all clients that ship this asset pack resolve it
 * to the same image.
 */
export const LILA_AVATAR_PREFIX = "lila-asset:";

const modules = import.meta.glob("../assets/avatars/*.{svg,png,jpg,jpeg,webp}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export type AvatarOption = {
  /** File name only, e.g. `aurora.svg` */
  id: string;
  /** Resolved URL for `<img src>` in this build */
  url: string;
  /** Value persisted on the account */
  stored: string;
};

export const AVATAR_OPTIONS: AvatarOption[] = Object.entries(modules)
  .map(([path, url]) => {
    const id = path.split("/").pop() ?? path;
    return {
      id,
      url,
      stored: `${LILA_AVATAR_PREFIX}${id}`,
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

export function resolveAvatarDisplayUrl(avatarUrl?: string): string | undefined {
  if (!avatarUrl) {
    return undefined;
  }
  if (avatarUrl.startsWith(LILA_AVATAR_PREFIX)) {
    const id = avatarUrl.slice(LILA_AVATAR_PREFIX.length);
    return AVATAR_OPTIONS.find((a) => a.id === id)?.url;
  }
  return avatarUrl;
}

export function optionMatchingStored(avatarUrl?: string): AvatarOption | undefined {
  if (!avatarUrl?.startsWith(LILA_AVATAR_PREFIX)) {
    return undefined;
  }
  const id = avatarUrl.slice(LILA_AVATAR_PREFIX.length);
  return AVATAR_OPTIONS.find((a) => a.id === id);
}
