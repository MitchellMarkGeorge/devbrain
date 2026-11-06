declare global {
  // whether this build has the dev seed (vite/main.config.ts)
  const __DEV_SEED__: boolean;

  namespace NodeJS {
    interface ProcessEnv {
      DEV_PATH: string;
      DEV_WORKSPACE_NAME: string;
      DEV_LINEAR_API_KEY?: string;
      DEVBRAIN_PATH: string;
      NODE_ENV: 'development' | 'production';
      VITE_DEV_SERVER_URL: string;
      DB_MIGRATIONS_PATH?: string;
    }
  }
}

// If this file has no imports/exports, turn it into a module
export {};
