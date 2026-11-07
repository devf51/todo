import { test, expect, type APIRequestContext } from "@playwright/test";

// เครื่องที่ติดตั้ง browser ของ Playwright ไม่ได้ (ไม่มี sudo) ให้ชี้ chromium ในเครื่องผ่าน env
if (process.env.CHROMIUM_PATH) {
  test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH } });
}

type Todo = { id: number; title: string; due_date: string | null; priority: string };

const post = (r: APIRequestContext, data: object) => r.post("/api/todos", { data });

test.describe("F2 API", () => {
  test("POST with due_date and priority returns both values", async ({ request }) => {
    const res = await post(request, { title: "a", due_date: "2026-12-31", priority: "high" });
    expect(res.status()).toBe(201);
    const t: Todo = await res.json();
    expect(t.due_date).toBe("2026-12-31");
    expect(t.priority).toBe("high");
  });

  test("POST without due_date and priority defaults to null and medium", async ({ request }) => {
    const t: Todo = await (await post(request, { title: "a" })).json();
    expect(t.due_date).toBeNull();
    expect(t.priority).toBe("medium");
  });

  for (const [name, data] of [
    ["due_date 31/12/2026", { due_date: "31/12/2026" }],
    ["due_date 2026-02-30", { due_date: "2026-02-30" }],
    ["due_date with time", { due_date: "2026-12-31T10:00:00" }],
    ["due_date empty string", { due_date: "" }],
    ["priority urgent", { priority: "urgent" }],
    ["priority null", { priority: null }],
  ] as const) {
    test(`POST ${name} returns 422 and count unchanged`, async ({ request }) => {
      const title = `bad-${name}`;
      const res = await post(request, { title, ...data });
      expect(res.status()).toBe(422);
      const list: Todo[] = await (await request.get("/api/todos")).json();
      expect(list.some((x) => x.title === title)).toBe(false);
    });
  }

  test("PATCH due_date and priority, null clears due_date", async ({ request }) => {
    const t: Todo = await (await post(request, { title: "p" })).json();
    let r = await request.patch(`/api/todos/${t.id}`, { data: { due_date: "2027-01-02", priority: "low" } });
    expect(r.status()).toBe(200);
    let b: Todo = await r.json();
    expect([b.due_date, b.priority]).toEqual(["2027-01-02", "low"]);
    r = await request.patch(`/api/todos/${t.id}`, { data: { due_date: null } });
    b = await r.json();
    expect(b.due_date).toBeNull();
    expect(b.priority).toBe("low");
    expect((await request.patch(`/api/todos/${t.id}`, { data: { due_date: "2026-02-30" } })).status()).toBe(422);
    expect((await request.patch(`/api/todos/${t.id}`, { data: { priority: "urgent" } })).status()).toBe(422);
  });

  test("GET /api/todos sorts by nearest due_date first, null last", async ({ request }) => {
    await post(request, { title: "s-null" });
    await post(request, { title: "s-late", due_date: "2098-05-01" });
    await post(request, { title: "s-early", due_date: "2097-01-01" });
    await post(request, { title: "s-mid", due_date: "2097-06-15" });
    const list: Todo[] = await (await request.get("/api/todos")).json();
    const dates = list.map((t) => t.due_date);
    const firstNull = dates.indexOf(null);
    if (firstNull >= 0) expect(dates.slice(firstNull).every((d) => d === null)).toBe(true);
    const dated = dates.filter((d): d is string => d !== null);
    expect(dated).toEqual([...dated].sort());
    const titles = list.map((t) => t.title);
    expect(titles.indexOf("s-early")).toBeLessThan(titles.indexOf("s-mid"));
    expect(titles.indexOf("s-mid")).toBeLessThan(titles.indexOf("s-late"));
    expect(titles.indexOf("s-late")).toBeLessThan(titles.indexOf("s-null"));
  });
});

test.describe("F2 web", () => {
  test("add with due date and priority shows both and survives reload", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("ชื่องาน").fill("w-add");
    await page.getByLabel("วันกำหนดส่ง").fill("2096-03-04");
    await page.getByLabel("ความสำคัญ").selectOption("high");
    await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
    const row = () => page.getByRole("listitem").filter({ hasText: "w-add" });
    await expect(row()).toContainText("2096-03-04");
    await expect(row()).toContainText("สูง");
    await page.reload();
    await expect(row()).toContainText("2096-03-04");
    await expect(row()).toContainText("สูง");
  });

  test("add without choosing shows medium and no due date", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("ชื่องาน").fill("w-default");
    await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
    const row = page.getByRole("listitem").filter({ hasText: "w-default" });
    await expect(row).toContainText("ปานกลาง");
    await expect(row).not.toContainText("ครบกำหนด");
  });

  test("edit due date and priority, then clear due date, survives reload", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("ชื่องาน").fill("w-edit");
    await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
    const row = () => page.getByRole("listitem").filter({ hasText: "w-edit" });
    // ตอนแก้ ชื่ออยู่ใน input ไม่ใช่ข้อความ จึงหา li จากช่องแก้ชื่อ
    const editing = () => page.getByRole("listitem").filter({ has: page.getByLabel("แก้ชื่อ w-edit") });
    await row().getByRole("button", { name: "แก้ไข" }).click();
    await editing().getByLabel("วันกำหนดส่ง").fill("2095-07-08");
    await editing().getByLabel("ความสำคัญ").selectOption("low");
    await editing().getByRole("button", { name: "บันทึก" }).click();
    await expect(row()).toContainText("2095-07-08");
    await expect(row()).toContainText("ต่ำ");
    await page.reload();
    await expect(row()).toContainText("2095-07-08");
    await expect(row()).toContainText("ต่ำ");

    await row().getByRole("button", { name: "แก้ไข" }).click();
    await editing().getByLabel("วันกำหนดส่ง").fill("");
    await editing().getByRole("button", { name: "บันทึก" }).click();
    await expect(row()).not.toContainText("ครบกำหนด");
    await page.reload();
    await expect(row()).not.toContainText("ครบกำหนด");
    await expect(row()).toContainText("ต่ำ");
  });
});
