import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

type T = { id: number; title: string; done: boolean; due_date: string | null; priority: "low" | "medium" | "high"; category_id: number | null };
const mk = (id: number, title: string, done = false, extra: Partial<T> = {}): T => ({ id, title, done, due_date: null, priority: "medium", category_id: null, ...extra });

let items: T[];
let cats: { id: number; name: string }[];
let fail: { method: string; status: number; detail?: unknown } | null;
let calls: { method: string; url: string; body?: any }[];

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

beforeEach(() => {
  items = [mk(1, "ซื้อนม"), mk(2, "ส่งงาน", true, { due_date: "2026-12-01", priority: "high" })];
  cats = [{ id: 1, name: "งาน" }];
  fail = null;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(init.body as string) : undefined;
      calls.push({ method, url, body });
      if (fail && fail.method === method) return json(fail.status, { detail: fail.detail });
      if (url.startsWith("/api/categories")) {
        const cid = Number(url.split("/")[3]);
        if (method === "GET") return json(200, cats);
        if (method === "POST") {
          cats.push({ id: 5, name: body.name });
          return json(201, cats.at(-1));
        }
        if (method === "PATCH") {
          const c = cats.find((x) => x.id === cid)!;
          c.name = body.name;
          return json(200, c);
        }
        cats = cats.filter((x) => x.id !== cid);
        items.forEach((i) => { if (i.category_id === cid) i.category_id = null; });
        return json(204);
      }
      const id = Number(url.split("/")[3]);
      if (method === "GET") return json(200, items);
      if (method === "POST") {
        const t = mk(items.length + 10, body.title, false, { due_date: body.due_date ?? null, priority: body.priority ?? "medium", category_id: body.category_id ?? null });
        items.push(t);
        return json(201, t);
      }
      if (method === "PATCH") {
        const t = items.find((i) => i.id === id)!;
        Object.assign(t, body);
        return json(200, t);
      }
      items = items.filter((i) => i.id !== id);
      return json(204);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("แสดง loading แล้วแสดงรายการจาก API", async () => {
    render(<App />);
    expect(screen.getByText("กำลังโหลด…")).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "ซื้อนม" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "ส่งงาน" })).toBeChecked();
  });

  it("โหลดไม่สำเร็จ → แสดง alert", async () => {
    fail = { method: "GET", status: 500, detail: "server พัง" };
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("server พัง");
  });

  it("ปุ่ม เพิ่ม ใช้ไม่ได้เมื่อช่องว่าง; เพิ่มสำเร็จแล้วรายการขึ้นและช่องถูกล้าง", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    const add = screen.getByRole("button", { name: "เพิ่ม" });
    expect(add).toBeDisabled();
    const input = screen.getByLabelText("ชื่องาน");
    await user.type(input, "งานใหม่");
    await user.click(add);
    expect(await screen.findByRole("checkbox", { name: "งานใหม่" })).toBeInTheDocument();
    expect(input).toHaveValue("");
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({ title: "งานใหม่" });
  });

  it("เพิ่มแล้ว 422 → alert, รายการไม่เพิ่ม, ช่องยังมีค่า", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    fail = { method: "POST", status: 422, detail: "title ยาวเกิน" };
    await user.type(screen.getByLabelText("ชื่องาน"), "x");
    await user.click(screen.getByRole("button", { name: "เพิ่ม" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("title ยาวเกิน");
    expect(screen.getByLabelText("ชื่องาน")).toHaveValue("x");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("ติ๊กส่ง PATCH done:true แล้วแสดงว่าเสร็จ; ยกเลิกติ๊กได้", async () => {
    const user = userEvent.setup();
    render(<App />);
    const box = await screen.findByRole("checkbox", { name: "ซื้อนม" });
    await user.click(box);
    expect(await screen.findByRole("checkbox", { name: "ซื้อนม", checked: true })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/todos/1", body: { done: true } });
    await user.click(screen.getByRole("checkbox", { name: "ซื้อนม" }));
    expect(await screen.findByRole("checkbox", { name: "ซื้อนม", checked: false })).toBeInTheDocument();
  });

  it("ติ๊กแล้ว server ตอบ error → ยังไม่เปลี่ยน และมี alert", async () => {
    const user = userEvent.setup();
    render(<App />);
    const box = await screen.findByRole("checkbox", { name: "ซื้อนม" });
    fail = { method: "PATCH", status: 500, detail: "พัง" };
    await user.click(box);
    expect(await screen.findByRole("alert")).toHaveTextContent("พัง");
    expect(screen.getByRole("checkbox", { name: "ซื้อนม" })).not.toBeChecked();
  });

  it("แก้ชื่อแล้ว บันทึก → ชื่อใหม่", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    const li = screen.getAllByRole("listitem")[0];
    await user.click(within(li).getByRole("button", { name: "แก้ไข" }));
    const edit = within(li).getByRole("textbox");
    await user.clear(edit);
    await user.type(edit, "ซื้อไข่");
    await user.click(within(li).getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByRole("checkbox", { name: "ซื้อไข่" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "ซื้อนม" })).not.toBeInTheDocument();
  });

  it("แก้ชื่อแล้ว 422 → alert และช่องแก้ยังอยู่พร้อมค่าที่พิมพ์", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    const li = screen.getAllByRole("listitem")[0];
    await user.click(within(li).getByRole("button", { name: "แก้ไข" }));
    fail = { method: "PATCH", status: 422, detail: "ชื่อว่าง" };
    await user.type(within(li).getByRole("textbox"), "!");
    await user.click(within(li).getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ชื่อว่าง");
    expect(within(li).getByRole("textbox")).toHaveValue("ซื้อนม!");
  });

  it("ลบ → รายการหาย", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    await user.click(within(screen.getAllByRole("listitem")[0]).getByRole("button", { name: "ลบ" }));
    await vi.waitFor(() => expect(screen.queryByRole("checkbox", { name: "ซื้อนม" })).not.toBeInTheDocument());
    expect(calls.find((c) => c.method === "DELETE")?.url).toBe("/api/todos/1");
  });

  it("แสดงวันกำหนดส่งและความสำคัญบนรายการ; ไม่มีวันที่ก็ไม่แสดง", async () => {
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    const [a, b] = screen.getAllByRole("listitem");
    expect(within(b).getByText(/2026-12-01/)).toBeInTheDocument();
    expect(within(b).getByText(/สูง/)).toBeInTheDocument();
    expect(within(a).queryByText(/ครบกำหนด/)).not.toBeInTheDocument();
    expect(within(a).getByText(/ปานกลาง/)).toBeInTheDocument();
  });

  it("เพิ่มพร้อมวันที่และความสำคัญ → body ถูก และรายการแสดงทั้งสองค่า", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    await user.type(screen.getByLabelText("ชื่องาน"), "งานด่วน");
    await user.type(screen.getByLabelText("วันกำหนดส่ง"), "2026-11-10");
    await user.selectOptions(screen.getByLabelText("ความสำคัญ"), "high");
    await user.click(screen.getByRole("button", { name: "เพิ่ม" }));
    const box = await screen.findByRole("checkbox", { name: "งานด่วน" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ title: "งานด่วน", due_date: "2026-11-10", priority: "high", category_id: null });
    const li = box.closest("li")!;
    expect(within(li).getByText(/2026-11-10/)).toBeInTheDocument();
    expect(within(li).getByText(/สูง/)).toBeInTheDocument();
  });

  it("ไม่เลือกอะไร → ส่ง priority medium และ due_date null", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    await user.type(screen.getByLabelText("ชื่องาน"), "ธรรมดา");
    await user.click(screen.getByRole("button", { name: "เพิ่ม" }));
    await screen.findByRole("checkbox", { name: "ธรรมดา" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ title: "ธรรมดา", due_date: null, priority: "medium", category_id: null });
  });

  it("แก้วันที่และความสำคัญ → PATCH ถูก", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    const li = screen.getAllByRole("listitem")[0];
    await user.click(within(li).getByRole("button", { name: "แก้ไข" }));
    await user.type(within(li).getByLabelText("วันกำหนดส่ง"), "2026-11-20");
    await user.selectOptions(within(li).getByLabelText("ความสำคัญ"), "low");
    await user.click(within(li).getByRole("button", { name: "บันทึก" }));
    await vi.waitFor(() => expect(within(screen.getAllByRole("listitem")[0]).getByText(/2026-11-20/)).toBeInTheDocument());
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ title: "ซื้อนม", due_date: "2026-11-20", priority: "low", category_id: null });
  });

  it("ล้างช่องวันที่ตอนแก้ → PATCH due_date: null", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    const li = screen.getAllByRole("listitem")[1];
    await user.click(within(li).getByRole("button", { name: "แก้ไข" }));
    const date = within(li).getByLabelText("วันกำหนดส่ง");
    expect(date).toHaveValue("2026-12-01");
    await user.clear(date);
    await user.click(within(li).getByRole("button", { name: "บันทึก" }));
    await vi.waitFor(() => expect(screen.getAllByRole("listitem")[1]).not.toHaveTextContent("2026-12-01"));
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ due_date: null });
  });

  it("เพิ่ม todo โดยเลือกหมวด → body มี category_id และรายการแสดงชื่อหมวด", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    await user.type(screen.getByLabelText("ชื่องาน"), "งานในหมวด");
    await user.selectOptions(screen.getByLabelText("หมวด"), "งาน");
    await user.click(screen.getByRole("button", { name: "เพิ่ม" }));
    const li = (await screen.findByRole("checkbox", { name: "งานในหมวด" })).closest("li")!;
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/todos")?.body).toMatchObject({ category_id: 1 });
    expect(li).toHaveTextContent("หมวด: งาน");
  });

  it("เลือก ไม่มีหมวด → category_id เป็น null", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("checkbox", { name: "ซื้อนม" });
    await user.type(screen.getByLabelText("ชื่องาน"), "ไม่มีหมวด");
    await user.click(screen.getByRole("button", { name: "เพิ่ม" }));
    expect(await screen.findByRole("checkbox", { name: "ไม่มีหมวด" })).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/todos")?.body.category_id).toBeNull();
  });

  it("แก้ todo เปลี่ยนหมวด → PATCH category_id", async () => {
    const user = userEvent.setup();
    render(<App />);
    const li = (await screen.findByRole("checkbox", { name: "ซื้อนม" })).closest("li")!;
    await user.click(within(li).getByRole("button", { name: "แก้ไข" }));
    await user.selectOptions(within(li).getByLabelText("หมวด"), "งาน");
    await user.click(within(li).getByRole("button", { name: "บันทึก" }));
    expect(await within(li).findByText(/หมวด: งาน/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ category_id: 1 });
  });

  it("ลบหมวด → โหลดใหม่ และ todo ที่เคยอยู่แสดง ไม่มีหมวด", async () => {
    items[0].category_id = 1;
    const user = userEvent.setup();
    render(<App />);
    const li = (await screen.findByRole("checkbox", { name: "ซื้อนม" })).closest("li")!;
    expect(li).toHaveTextContent("หมวด: งาน");
    await user.click(screen.getByRole("button", { name: "ลบหมวด" }));
    await waitFor(() => expect(li).toHaveTextContent("ไม่มีหมวด"));
    expect(li).not.toHaveTextContent("หมวด: งาน");
  });

  it("เปลี่ยนชื่อหมวด → ชื่อบน todo เปลี่ยนทันที", async () => {
    items[0].category_id = 1;
    const user = userEvent.setup();
    render(<App />);
    const li = (await screen.findByRole("checkbox", { name: "ซื้อนม" })).closest("li")!;
    await user.click(screen.getByRole("button", { name: "เปลี่ยนชื่อ" }));
    const edit = screen.getByLabelText("ชื่อใหม่ของ งาน");
    await user.clear(edit);
    await user.type(edit, "งานด่วน");
    await user.click(screen.getByRole("button", { name: "บันทึก" }));
    expect(await screen.findByText(/หมวด: งานด่วน/)).toBeInTheDocument();
    expect(li).toBeTruthy();
  });
});
