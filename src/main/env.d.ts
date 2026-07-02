declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DEV_PATH: string;
      DEV_WORKSPACE_NAME: string;
      DEVBRAIN_PATH: string;
      NODE_ENV: 'development' | 'production';
      VITE_DEV_SERVER_URL: string;
      DB_MIGRATIONS_PATH: string;
    }
  }
}

// If this file has no imports/exports, turn it into a module
export {};
