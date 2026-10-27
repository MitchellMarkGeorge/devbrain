// Placeholder for the typed IPC router (docs/ipc/implementation-plan.md, milestone 2). It lets the
// renderer's typecheck read a type exported from src/main before the real router exists.
export type AppRouter = {
  app: {
    ping: () => Promise<string>;
  };
};
