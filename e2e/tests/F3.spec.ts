import { test, expect, type APIRequestContext } from "@playwright/test";

// เครื่องที่ติดตั้ง browser ของ Playwright ไม่ได้ (ไม่มี sudo) ให้ชี้ chromium ในเครื่องผ่าน env
if (process.env.CHROMIUM_PATH) {
  test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH } });
}

type Cat = { id: number; name: string };
type Todo = { id: number; title: string; category_id: number | null };

// ไฟล์เทสต์รันขนานบน DB เดียว ชื่อหมวดต้องไม่ซ้ำข้ามเทสต์
let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${Date.now()}-${n++}`;
const mkCat = async (r: APIRequestContext, name = uniq("cat")) => {
  const res = await r.post("/api/categories", { data: { name } });
  expect(res.status()).toBe(201);
  return (await res.json()) as Cat;
};
const mkTodo = async (r: APIRequestContext, data: object) => (await (await r.post("/api/todos", { data })).json()) as Todo;
const todos = async (r: APIRequestContext) => (await (await r.get("/api/todos")).json()) as Todo[];

test.describe("F3 API", () => {
  test("POST /api/categories returns 201 {id,name} and appears in GET", async ({ request }) => {
    const name = uniq("งาน");
    const c = await mkCat(request, `  ${name}  `);
    expect(c.name).toBe(name);
    const list = (await (await request.get("/api/categories")).json()) as Cat[];
    expect(list).toContainEqual(c);
  });

  test("duplicate category name returns 409", async ({ request }) => {
    const c = await mkCat(request);
    expect((await request.post("/api/categories", { data: { name: c.name } })).status()).toBe(409);
  });

  for (const [name, value] of [["empty", ""], ["spaces only", "   "], ["over 50 chars", "ก".repeat(51)]] as const) {
    test(`category name ${name} returns 422 on POST and PATCH`, async ({ request }) => {
      expect((await request.post("/api/categories", { data: { name: value } })).status()).toBe(422);
      const c = await mkCat(request);
      expect((await request.patch(`/api/categories/${c.id}`, { data: { name: value } })).status()).toBe(422);
    });
  }

  test("PATCH rename keeps todo in the same category; duplicate name 409; unknown id 404", async ({ request }) => {
    const a = await mkCat(request);
    const b = await mkCat(request);
    const t = await mkTodo(request, { title: uniq("t"), category_id: a.id });
    const newName = uniq("ใหม่");
    const res = await request.patch(`/api/categories/${a.id}`, { data: { name: newName } });
    expect(res.status()).toBe(200);
    expect((await res.json()).name).toBe(newName);
    expect((await todos(request)).find((x) => x.id === t.id)?.category_id).toBe(a.id);
    expect((await request.patch(`/api/categories/${a.id}`, { data: { name: b.name } })).status()).toBe(409);
    expect((await request.patch("/api/categories/999999999", { data: { name: "x" } })).status()).toBe(404);
  });

  test("todo POST/PATCH category_id: existing saved, unknown 422, null clears", async ({ request }) => {
    const c = await mkCat(request);
    const t = await mkTodo(request, { title: uniq("t"), category_id: c.id });
    expect(t.category_id).toBe(c.id);
    expect((await request.post("/api/todos", { data: { title: "x", category_id: 999999999 } })).status()).toBe(422);
    const t2 = await mkTodo(request, { title: uniq("t") });
    expect(t2.category_id).toBeNull();
    let r = await request.patch(`/api/todos/${t2.id}`, { data: { category_id: c.id } });
    expect((await r.json()).category_id).toBe(c.id);
    expect((await request.patch(`/api/todos/${t2.id}`, { data: { category_id: 999999999 } })).status()).toBe(422);
    r = await request.patch(`/api/todos/${t2.id}`, { data: { category_id: null } });
    expect((await r.json()).category_id).toBeNull();
  });

  test("DELETE category returns 204, todos stay with category_id null; unknown id 404", async ({ request }) => {
    const c = await mkCat(request);
    const t = await mkTodo(request, { title: uniq("t"), category_id: c.id });
    expect((await request.delete(`/api/categories/${c.id}`)).status()).toBe(204);
    expect((await todos(request)).find((x) => x.id === t.id)).toMatchObject({ title: t.title, category_id: null });
    expect((await request.delete(`/api/categories/${c.id}`)).status()).toBe(404);
  });
});

test.describe("F3 web", () => {
  const catRow = (page: import("@playwright/test").Page, name: string) => page.getByRole("group", { name, exact: true });
  const todoRow = (page: import("@playwright/test").Page, title: string) =>
    page.getByRole("listitem").filter({ hasText: title });

  test("create category, add todo with it, see name on item after reload", async ({ page }) => {
    const name = uniq("สร้าง");
    const title = uniq("w-t");
    await page.goto("/");
    await page.getByLabel("ชื่อหมวด").fill(name);
    await page.getByRole("button", { name: "เพิ่มหมวด" }).click();
    await expect(catRow(page, name)).toBeVisible();
    await page.getByLabel("ชื่องาน").fill(title);
    await page.getByLabel("หมวด", { exact: true }).selectOption({ label: name });
    await page.getByRole("button", { name: "เพิ่ม", exact: true }).click();
    await expect(todoRow(page, title)).toContainText(`หมวด: ${name}`);
    await page.reload();
    await expect(todoRow(page, title)).toContainText(`หมวด: ${name}`);
  });

  test("duplicate category name shows error alert", async ({ page, request }) => {
    const c = await mkCat(request);
    await page.goto("/");
    await page.getByLabel("ชื่อหมวด").fill(c.name);
    await page.getByRole("button", { name: "เพิ่มหมวด" }).click();
    await expect(page.getByRole("alert")).toContainText("already exists");
  });

  test("rename category updates name on its todos immediately and after reload", async ({ page, request }) => {
    const c = await mkCat(request);
    const title = uniq("w-r");
    await mkTodo(request, { title, category_id: c.id });
    const newName = uniq("ชื่อใหม่");
    await page.goto("/");
    await expect(todoRow(page, title)).toContainText(`หมวด: ${c.name}`);
    await catRow(page, c.name).getByRole("button", { name: "เปลี่ยนชื่อ" }).click();
    await catRow(page, c.name).getByLabel(`ชื่อใหม่ของ ${c.name}`).fill(newName);
    await catRow(page, c.name).getByRole("button", { name: "บันทึก" }).click();
    await expect(todoRow(page, title)).toContainText(`หมวด: ${newName}`);
    await page.reload();
    await expect(todoRow(page, title)).toContainText(`หมวด: ${newName}`);
  });

  test("delete category leaves todo with no category", async ({ page, request }) => {
    const c = await mkCat(request);
    const title = uniq("w-d");
    await mkTodo(request, { title, category_id: c.id });
    await page.goto("/");
    await expect(todoRow(page, title)).toContainText(`หมวด: ${c.name}`);
    await catRow(page, c.name).getByRole("button", { name: "ลบหมวด" }).click();
    await expect(catRow(page, c.name)).toHaveCount(0);
    await expect(todoRow(page, title)).toContainText("ไม่มีหมวด");
    await page.reload();
    await expect(todoRow(page, title)).toContainText("ไม่มีหมวด");
  });

  test("edit todo to change and clear its category", async ({ page, request }) => {
    const c = await mkCat(request);
    const title = uniq("w-e");
    await mkTodo(request, { title });
    await page.goto("/");
    const editing = () => page.getByRole("listitem").filter({ has: page.getByLabel(`แก้ชื่อ ${title}`) });
    await todoRow(page, title).getByRole("button", { name: "แก้ไข" }).click();
    await editing().getByLabel("หมวด", { exact: true }).selectOption({ label: c.name });
    await editing().getByRole("button", { name: "บันทึก" }).click();
    await expect(todoRow(page, title)).toContainText(`หมวด: ${c.name}`);
    await page.reload();
    await expect(todoRow(page, title)).toContainText(`หมวด: ${c.name}`);
    await todoRow(page, title).getByRole("button", { name: "แก้ไข" }).click();
    await editing().getByLabel("หมวด", { exact: true }).selectOption({ label: "ไม่มีหมวด" });
    await editing().getByRole("button", { name: "บันทึก" }).click();
    await expect(todoRow(page, title)).toContainText("ไม่มีหมวด");
  });
});
