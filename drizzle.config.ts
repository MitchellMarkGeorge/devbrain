import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/main/db/schema',
  out: './src/main/db/migrations',
  dialect: 'sqlite',
  // migrations are via the code
});
