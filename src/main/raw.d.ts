// A file imported with ?raw is its text: Vite inlines it in the main build and in Vitest, and
// scripts/raw-loader.mjs reads it for scripts run with tsx
declare module '*?raw' {
  const text: string;
  export default text;
}
