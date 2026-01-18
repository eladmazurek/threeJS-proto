/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_TILES_API_KEY: string;
  readonly VITE_OPEN_SKY_CLIENT_ID?: string;
  readonly VITE_OPEN_SKY_CLIENT_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
