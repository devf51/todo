import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Categories from "./Categories";

const cats = [{ id: 1, name: "งาน" }, { id: 2, name: "บ้าน" }];
let calls: { method: string; url: string; body?: any }[];
let fail: { status: number; detail: string } | null;
const onChange = vi.fn();

beforeEach(() => {
  calls = [];
  fail = null;
  onChange.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ method: init.method ?? "GET", url, body: init.body ? JSON.parse(init.body as string) : undefined });
      if (fail) return new Response(JSON.stringify({ detail: fail.detail }), { status: fail.status });
      return init.method === "DELETE" ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ id: 9, name: "x" }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Categories", () => {
  it("แสดงหมวดทั้งหมด", () => {
    render(<Categories categories={cats} onChange={onChange} />);
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getByText("บ้าน")).toBeInTheDocument();
  });

  it("เพิ่มหมวด → POST, ล้างช่อง, เรียก onChange", async () => {
    const user = userEvent.setup();
    render(<Categories categories={cats} onChange={onChange} />);
    const input = screen.getByLabelText("ชื่อหมวด");
    expect(screen.getByRole("button", { name: "เพิ่มหมวด" })).toBeDisabled();
    await user.type(input, "ใหม่");
    await user.click(screen.getByRole("button", { name: "เพิ่มหมวด" }));
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/categories", body: { name: "ใหม่" } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("");
  });

  it("เปลี่ยนชื่อ → PATCH แล้ว onChange", async () => {
    const user = userEvent.setup();
    render(<Categories categories={cats} onChange={onChange} />);
    const li = screen.getByRole("group", { name: "งาน" });
    await user.click(within(li).getByRole("button", { name: "เปลี่ยนชื่อ" }));
    const edit = within(li).getByLabelText("ชื่อใหม่ของ งาน");
    await user.clear(edit);
    await user.type(edit, "งานด่วน");
    await user.click(within(li).getByRole("button", { name: "บันทึก" }));
    expect(calls[0]).toMatchObject({ method: "PATCH", url: "/api/categories/1", body: { name: "งานด่วน" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ลบหมวด → DELETE แล้ว onChange", async () => {
    const user = userEvent.setup();
    render(<Categories categories={cats} onChange={onChange} />);
    await user.click(within(screen.getByRole("group", { name: "บ้าน" })).getByRole("button", { name: "ลบหมวด" }));
    expect(calls[0]).toMatchObject({ method: "DELETE", url: "/api/categories/2" });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ชื่อซ้ำ 409 → alert, ไม่เรียก onChange, ช่องยังมีค่า", async () => {
    const user = userEvent.setup();
    render(<Categories categories={cats} onChange={onChange} />);
    fail = { status: 409, detail: "category name already exists" };
    await user.type(screen.getByLabelText("ชื่อหมวด"), "งาน");
    await user.click(screen.getByRole("button", { name: "เพิ่มหมวด" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("category name already exists");
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("ชื่อหมวด")).toHaveValue("งาน");
  });
});
