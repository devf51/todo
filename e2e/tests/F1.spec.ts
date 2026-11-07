import { test, expect } from "@playwright/test";

// เครื่องที่ติดตั้ง browser ของ Playwright ไม่ได้ (ไม่มี sudo) ให้ชี้ chromium ในเครื่องผ่าน env
if (process.env.CHROMIUM_PATH) {
  test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH } });
}

type Todo = { id: number; title: string; done: boolean };

test.describe("F1 API", () => {
  test("POST /api/todos returns 201 and appears in GET list", async ({ request }) => {
    const res = await request.post("/api/todos", { data: { title: "ซื้อนม" } });
    expect(res.status()).toBe(201);
    const t: Todo = await res.json();
    expect(t.title).toBe("ซื้อนม");
    expect(t.done).toBe(false);
    expect(typeof t.id).toBe("number");
    const list: Todo[] = await (await request.get("/api/todos")).json();
    expect(list.some((x) => x.id === t.id)).toBe(true);
  });

  for (const [name, title] of [
    ["empty", ""],
    ["spaces only", "   "],
    ["over 200 chars", "ก".repeat(201)],
  ] as const) {
    test(`POST /api/todos with title ${name} returns 422 and count unchanged`, async ({ request }) => {
      // ไฟล์เทสต์รันขนานกันบน DB เดียว จึงเทียบจำนวนรายการที่มี title นี้ ไม่ใช่จำนวนทั้งหมด
      const same = async () =>
        ((await (await request.get("/api/todos")).json()) as Todo[]).filter((x) => x.title === title).length;
      const before = await same();
      const res = await request.post("/api/todos", { data: { title } });
      expect(res.status()).toBe(422);
      expect(await same()).toBe(before);
    });
  }

  test("POST /api/todos accepts title of exactly 200 chars", async ({ request }) => {
    const res = await request.post("/api/todos", { data: { title: "ก".repeat(200) } });
    expect(res.status()).toBe(201);
  });

  test("concurrent POST /api/todos all return 201", async ({ request }) => {
    const rs = await Promise.all(
      Array.from({ length: 30 }, (_, i) => request.post("/api/todos", { data: { title: `conc-${i}` } })),
    );
    expect(rs.map((r) => r.status())).toEqual(Array(30).fill(201));
  });

  test("PATCH /api/todos/{id} toggles done and changes title", async ({ request }) => {
    const t: Todo = await (await request.post("/api/todos", { data: { title: "patch me" } })).json();
    let r = await request.patch(`/api/todos/${t.id}`, { data: { done: true } });
    expect(r.status()).toBe(200);
    expect((await r.json()).done).toBe(true);
    r = await request.patch(`/api/todos/${t.id}`, { data: { done: false } });
    expect((await r.json()).done).toBe(false);
    r = await request.patch(`/api/todos/${t.id}`, { data: { title: "ซื้อนมจืด" } });
    expect(r.status()).toBe(200);
    expect((await r.json()).title).toBe("ซื้อนมจืด");
  });

  test("DELETE /api/todos/{id} returns 204 and removes it; second delete returns 404", async ({ request }) => {
    const t: Todo = await (await request.post("/api/todos", { data: { title: "delete me" } })).json();
    const r = await request.delete(`/api/todos/${t.id}`);
    expect(r.status()).toBe(204);
    const list: Todo[] = await (await request.get("/api/todos")).json();
    expect(list.some((x) => x.id === t.id)).toBe(false);
    expect((await request.delete(`/api/todos/${t.id}`)).status()).toBe(404);
  });

  test("PATCH and DELETE unknown id return 404", async ({ request }) => {
    expect((await request.patch("/api/todos/999999", { data: { done: true } })).status()).toBe(404);
    expect((await request.delete("/api/todos/999999")).status()).toBe(404);
  });
});

test.describe("F1 web", () => {
  test("add todo shows in list and survives reload", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("ชื่องาน").fill("e2e เพิ่ม");
    await page.getByRole("button", { name: "เพิ่ม" }).click();
    await expect(page.getByText("e2e เพิ่ม")).toBeVisible();
    await page.reload();
    await expect(page.getByText("e2e เพิ่ม")).toBeVisible();
  });

  test("toggle done shows done and survives reload", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("ชื่องาน").fill("e2e ติ๊ก");
    await page.getByRole("button", { name: "เพิ่ม" }).click();
    const row = page.getByRole("listitem").filter({ hasText: "e2e ติ๊ก" });
    await row.getByRole("checkbox").click();
    await expect(row.getByRole("checkbox")).toBeChecked();
    await expect(row).toHaveClass(/done/);
    await page.reload();
    const row2 = page.getByRole("listitem").filter({ hasText: "e2e ติ๊ก" });
    await expect(row2.getByRole("checkbox")).toBeChecked();
    await row2.getByRole("checkbox").click();
    await expect(row2.getByRole("checkbox")).not.toBeChecked();
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "e2e ติ๊ก" }).getByRole("checkbox")).not.toBeChecked();
  });

  test("edit title survives reload", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("ชื่องาน").fill("e2e ชื่อเก่า");
    await page.getByRole("button", { name: "เพิ่ม" }).click();
    await page.getByRole("listitem").filter({ hasText: "e2e ชื่อเก่า" }).getByRole("button", { name: "แก้ไข" }).click();
    const input = page.getByLabel("แก้ชื่อ e2e ชื่อเก่า");
    await input.fill("e2e ชื่อใหม่");
    await page.getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByText("e2e ชื่อใหม่")).toBeVisible();
    await page.reload();
    await expect(page.getByText("e2e ชื่อใหม่")).toBeVisible();
    await expect(page.getByText("e2e ชื่อเก่า")).toHaveCount(0);
  });

  test("delete removes todo and stays removed after reload", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("ชื่องาน").fill("e2e ลบ");
    await page.getByRole("button", { name: "เพิ่ม" }).click();
    await page.getByRole("listitem").filter({ hasText: "e2e ลบ" }).getByRole("button", { name: "ลบ" }).click();
    await expect(page.getByText("e2e ลบ")).toHaveCount(0);
    await page.reload();
    await expect(page.getByText("e2e ลบ")).toHaveCount(0);
  });

  test("empty or whitespace title cannot be added", async ({ page }) => {
    await page.goto("/");
    const add = page.getByRole("button", { name: "เพิ่ม" });
    await expect(add).toBeDisabled();
    await page.getByLabel("ชื่องาน").fill("   ");
    await expect(add).toBeDisabled();
  });

  test("editing title to empty shows error and keeps old title", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("ชื่องาน").fill("e2e แก้ว่าง");
    await page.getByRole("button", { name: "เพิ่ม" }).click();
    await page.getByRole("listitem").filter({ hasText: "e2e แก้ว่าง" }).getByRole("button", { name: "แก้ไข" }).click();
    await page.getByLabel("แก้ชื่อ e2e แก้ว่าง").fill("");
    await page.getByRole("button", { name: "บันทึก" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.reload();
    await expect(page.getByText("e2e แก้ว่าง")).toBeVisible();
  });
});
