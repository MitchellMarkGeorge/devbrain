import { describe, expectTypeOf, it } from 'vitest';
import type { Client } from '@common/ipc/client-types';
import type { AppRouter } from '@main/ipc/router';

// Checked by `npm run typecheck`, which reads AppRouter from main's emitted declarations
// (tsconfig.web.json): a wrong router type fails the renderer's typecheck.
describe('AppRouter', () => {
  it('is readable from the renderer', () => {
    expectTypeOf<ReturnType<Client<AppRouter>['app']['ping']>>().toEqualTypeOf<Promise<string>>();
    expectTypeOf<ReturnType<Client<AppRouter>['app']['version']>>().toEqualTypeOf<
      Promise<string>
    >();
  });

  it('calls app.ping with no input', () => {
    expectTypeOf<Parameters<Client<AppRouter>['app']['ping']>>().toEqualTypeOf<
      [input?: void, options?: { signal?: AbortSignal }]
    >();
  });
});
