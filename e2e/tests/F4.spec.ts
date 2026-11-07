import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// เครื่องที่ติดตั้ง browser ของ Playwright ไม่ได้ (ไม่มี sudo) ให้ชี้ chromium ในเครื่องผ่าน env
if (process.env.CHROMIUM_PATH) {
  test.use({ launchOptions: { executablePath: process.env.CHROMIUM_PATH } });
}

type Todo = { id: number; title: string; done: boolean; priority: string; category_id: number | null };

// ไฟล์เทสต์รันขนานบน DB เดียว ใช้ชื่อไม่ซ้ำ และกรองด้วยหมวดของเทสต์เองเพื่อไม่ปนข้อมูลเทสต์อื่น
let n = 0;
const uniq = (p: string) => `${p}-${process.pid}-${Date.now()}-${n++}`;

async function seed(r: APIRequestContext) {
  const cat = await (await r.post("/api/categories", { data: { name: uniq("f4cat") } })).json();
  const mk = async (suffix: string, priority: string, done: boolean) => {
    const title = uniq(`f4-${suffix}`);
    const t: Todo = await (await r.post("/api/todos", { data: { title, priority, category_id: cat.id } })).json();
    if (done) await r.patch(`/api/todos/${t.id}`, { data: { done: true } });
    return title;
  };
  const a = await mk("a", "high", false);
  const b = await mk("b", "high", true);
  const c = await mk("c", "low", false);
  const d = await mk("d", "medium", true);
  return { cat, a, b, c, d };
}

const titles = async (r: APIRequestContext, query: string) =>
  ((await (await r.get(`/api/todos${query}`)).json()) as Todo[]).map((t) => t.title);

test.describe("F4 API", () => {
  test("status=active / done / none returns right subset", async ({ request }) => {
    const { cat, a, b, c, d } = await seed(request);
    const q = (s: string) => titles(request, `?category_id=${cat.id}${s}`);
    expect(await q("&status=active")).toEqual([a, c]);
    expect(await q("&status=done")).toEqual([b, d]);
    expect(await q("")).toEqual([a, b, c, d]);
    expect(await q("&status=all")).toEqual([a, b, c, d]);
  });

  test("category_id and priority filter", async ({ request }) => {
    const { cat, a, b } = await seed(request);
    await seed(request); // หมวดอื่นต้องไม่ปน
    expect(await titles(request, `?category_id=${cat.id}`)).toHaveLength(4);
    expect(await titles(request, `?category_id=${cat.id}&priority=high`)).toEqual([a, b]);
    const all = await (await request.get("/api/todos?priority=high")).json();
    expect((all as Todo[]).every((t) => t.priority === "high")).toBe(true);
  });

  test("combined filters return only rows matching all", async ({ request }) => {
    const { cat, a } = await seed(request);
    expect(await titles(request, `?status=active&priority=high&category_id=${cat.id}`)).toEqual([a]);
  });

  for (const q of ["?status=xxx", "?priority=xxx", "?category_id=abc", "?category_id=99999999999999999999"]) {
    test(`invalid filter ${q} returns 422`, async ({ request }) => {
      expect((await request.get(`/api/todos${q}`)).status()).toBe(422);
    });
  }

  test("unknown category_id returns empty list", async ({ request }) => {
    expect(await titles(request, "?category_id=999999")).toEqual([]);
  });
});

test.describe("F4 web", () => {
  const row = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });

  test("changing filters updates list immediately and combines", async ({ page, request }) => {
    const { cat, a, b, c, d } = await seed(request);
    await page.goto("/");
    await page.getByLabel("กรองหมวด").selectOption({ label: cat.name });
    for (const t of [a, b, c, d]) await expect(row(page, t)).toHaveCount(1);

    await page.getByLabel("สถานะ").selectOption({ label: "ยังไม่เสร็จ" });
    await expect(row(page, a)).toHaveCount(1);
    await expect(row(page, c)).toHaveCount(1);
    await expect(row(page, b)).toHaveCount(0);
    await expect(row(page, d)).toHaveCount(0);

    await page.getByLabel("กรองความสำคัญ").selectOption({ label: "สูง" });
    await expect(row(page, a)).toHaveCount(1);
    await expect(row(page, c)).toHaveCount(0);

    await page.getByLabel("สถานะ").selectOption({ label: "ทั้งหมด" });
    await expect(row(page, b)).toHaveCount(1);
    await expect(row(page, a)).toHaveCount(1);
    await expect(row(page, d)).toHaveCount(0);

    await page.getByLabel("กรองความสำคัญ").selectOption({ label: "ทั้งหมด" });
    await expect(row(page, d)).toHaveCount(1);
  });

  test("ticking a todo under status=active filter removes it from the list", async ({ page, request }) => {
    const { cat, a, c } = await seed(request);
    await page.goto("/");
    await page.getByLabel("กรองหมวด").selectOption({ label: cat.name });
    await page.getByLabel("สถานะ").selectOption({ label: "ยังไม่เสร็จ" });
    await expect(row(page, a)).toHaveCount(1);
    await page.getByRole("checkbox", { name: a }).click();
    await expect(row(page, a)).toHaveCount(0);
    await expect(row(page, c)).toHaveCount(1);
  });
});
