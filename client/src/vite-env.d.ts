/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STDB_HOST?: string;
  readonly VITE_STDB_MODULE?: string;
  readonly VITE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
