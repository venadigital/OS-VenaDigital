/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Where the Mac's download service listens (default http://127.0.0.1:4318). */
  readonly VITE_DOWNLOADER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
