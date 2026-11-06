// A file imported with ?raw is its text, which Vite inlines: in the main build, in Vitest and in
// scripts run with scripts/run-with-vite.mts
declare module '*?raw' {
  const text: string;
  export default text;
}
