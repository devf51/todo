export type Todo = {
  id: number;
  title: string;
  done: boolean;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  category_id: number | null;
};

export type Category = { id: number; name: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
  }
}

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(
      res.status,
      typeof data?.detail === "string" ? data.detail : `เกิดข้อผิดพลาด (${res.status})`,
    );
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

type Priority = Todo["priority"];
export type TodoFilters = { status?: "all" | "active" | "done"; category_id?: number; priority?: Priority };

export const listTodos = (filters: TodoFilters = {}) => {
  const q = new URLSearchParams();
  if (filters.status && filters.status !== "all") q.set("status", filters.status);
  if (filters.category_id !== undefined) q.set("category_id", String(filters.category_id));
  if (filters.priority) q.set("priority", filters.priority);
  return request<Todo[]>(`/todos${q.size ? `?${q}` : ""}`);
};
type Fields = { due_date?: string | null; priority?: Priority; category_id?: number | null };

export const createTodo = (input: { title: string } & Fields) => request<Todo>("/todos", "POST", input);
export const updateTodo = (id: number, patch: { title?: string; done?: boolean } & Fields) =>
  request<Todo>(`/todos/${id}`, "PATCH", patch);
export const deleteTodo = (id: number) => request<void>(`/todos/${id}`, "DELETE");

export const listCategories = () => request<Category[]>("/categories");
export const createCategory = (name: string) => request<Category>("/categories", "POST", { name });
export const renameCategory = (id: number, name: string) => request<Category>(`/categories/${id}`, "PATCH", { name });
export const deleteCategory = (id: number) => request<void>(`/categories/${id}`, "DELETE");
