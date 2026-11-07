import { defineConfig } from "@playwright/test";

const db = `${import.meta.dirname}/.tmp/e2e.db`;

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:5174" },
  webServer: [
    {
      // ลบ DB ก่อนทุกครั้งให้แต่ละรอบเริ่มจากข้อมูลว่าง
      command:
        `rm -f ${db} && mkdir -p ${import.meta.dirname}/.tmp && .venv/bin/uvicorn app.main:app --port 8001`,
      cwd: "../backend",
      env: { DATABASE_PATH: db },
      url: "http://localhost:8001/api/todos",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5174 --strictPort",
      cwd: "../frontend",
      env: { API_TARGET: "http://localhost:8001" },
      url: "http://localhost:5174",
      reuseExistingServer: false,
    },
  ],
});
