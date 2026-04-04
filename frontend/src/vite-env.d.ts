/// <reference types="vite/client" />

declare module "*.mp3" {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_NAKAMA_SERVER_KEY: string;
  readonly VITE_NAKAMA_HOST: string;
  readonly VITE_NAKAMA_PORT: string;
  readonly VITE_NAKAMA_USE_SSL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
