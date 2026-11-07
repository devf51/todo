import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createTodo, deleteTodo, listTodos, updateTodo } from "./api";

const todo = { id: 1, title: "a", done: false, due_date: null, priority: "medium", category_id: null };

function mockFetch(status: number, body?: unknown) {
  const f = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("listTodos GET /api/todos", async () => {
    const f = mockFetch(200, [todo]);
    expect(await listTodos()).toEqual([todo]);
    expect(f.mock.calls[0][0]).toBe("/api/todos");
  });

  it("createTodo POST พร้อม JSON body", async () => {
    const f = mockFetch(201, todo);
    expect(await createTodo({ title: "a" })).toEqual(todo);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/todos");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe('{"title":"a"}');
  });

  it("updateTodo PATCH /api/todos/{id}", async () => {
    const f = mockFetch(200, { ...todo, done: true });
    await updateTodo(1, { done: true });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/todos/1");
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe('{"done":true}');
  });

  it("deleteTodo DELETE และรับ 204", async () => {
    const f = mockFetch(204);
    await expect(deleteTodo(1)).resolves.toBeUndefined();
    expect(f.mock.calls[0][0]).toBe("/api/todos/1");
    expect(f.mock.calls[0][1].method).toBe("DELETE");
  });

  it("throw ApiError ด้วย detail ที่เป็น string", async () => {
    mockFetch(404, { detail: "todo not found" });
    await expect(deleteTodo(9)).rejects.toMatchObject({ status: 404, detail: "todo not found" });
    await expect(deleteTodo(9)).rejects.toBeInstanceOf(ApiError);
  });

  it("detail ไม่ใช่ string → ข้อความทั่วไป", async () => {
    mockFetch(422, { detail: [{ msg: "x" }] });
    const err = await createTodo({ title: "" }).catch((e) => e);
    expect(err.status).toBe(422);
    expect(typeof err.detail).toBe("string");
    expect(err.detail).not.toBe("");
  });

  it("body ไม่ใช่ JSON (500) → ข้อความทั่วไป", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));
    await expect(listTodos()).rejects.toMatchObject({ status: 500 });
  });
});
