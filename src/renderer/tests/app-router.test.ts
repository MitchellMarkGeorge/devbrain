import { describe, expectTypeOf, it } from 'vitest';
import type { AppRouter } from '@main/ipc/router';

// Checked by `npm run typecheck`, which reads AppRouter from main's emitted declarations
// (tsconfig.web.json): a wrong router type fails the renderer's typecheck.
describe('AppRouter', () => {
  it('is readable from the renderer', () => {
    expectTypeOf<ReturnType<AppRouter['app']['ping']>>().toEqualTypeOf<Promise<string>>();
  });
});
