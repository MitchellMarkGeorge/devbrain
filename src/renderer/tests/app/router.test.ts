import { describe, expectTypeOf, it } from 'vitest';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@main/ipc/router';

// Checked by `npm run typecheck`, which reads AppRouter from main's source (tsconfig.web.json maps
// @main to it): a wrong router type fails the renderer's typecheck.
describe('AppRouter', () => {
  it('is readable from the renderer', () => {
    expectTypeOf<inferRouterOutputs<AppRouter>['app']['ping']>().toEqualTypeOf<string>();
    expectTypeOf<inferRouterOutputs<AppRouter>['app']['version']>().toEqualTypeOf<string>();
    expectTypeOf<inferRouterInputs<AppRouter>['app']['ping']>().toEqualTypeOf<void>();
  });

  it("takes the cursor of core's paged lists at the top of their input, for infinite queries", () => {
    type Inputs = inferRouterInputs<AppRouter>;
    type Cursor = string | null | undefined;
    // an input that may be left out is `void | …`
    type Given<T> = Exclude<T, void | undefined>;
    expectTypeOf<Given<Inputs['notes']['list']>['cursor']>().toEqualTypeOf<Cursor>();
    expectTypeOf<Given<Inputs['projects']['list']>['cursor']>().toEqualTypeOf<Cursor>();
    expectTypeOf<Given<Inputs['favorites']['list']>['cursor']>().toEqualTypeOf<Cursor>();
    expectTypeOf<Given<Inputs['workspaces']['list']>['cursor']>().toEqualTypeOf<Cursor>();
  });
});
