export type Todo = {
  id: number;
  title: string;
  done: boolean;
  due_date: string | null;
  priority: "low" | "medium" | "high";
  category_id: number | null;
};

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

export const listTodos = () => request<Todo[]>("/todos");
type Priority = Todo["priority"];
type Fields = { due_date?: string | null; priority?: Priority };

export const createTodo = (input: { title: string } & Fields) => request<Todo>("/todos", "POST", input);
export const updateTodo = (id: number, patch: { title?: string; done?: boolean } & Fields) =>
  request<Todo>(`/todos/${id}`, "PATCH", patch);
export const deleteTodo = (id: number) => request<void>(`/todos/${id}`, "DELETE");
