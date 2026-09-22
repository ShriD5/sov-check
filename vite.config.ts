import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { devApi } from "./api/dev-middleware";

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
  build: { target: "es2022" },
});
