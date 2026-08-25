import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base must match your GitHub Pages repo name, e.g. https://<user>.github.io/ScopeIQ/
export default defineConfig({
  plugins: [react()],
  base: "/ScopeIQ/",
});
