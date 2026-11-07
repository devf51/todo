import { useEffect, useState, type FormEvent } from "react";
import { ApiError, createTodo, deleteTodo, listTodos, updateTodo, type Todo } from "./api";
import "./App.css";

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // เปลี่ยนจอหลัง server ตอบสำเร็จเท่านั้น; error → แสดง alert และคงค่าที่พิมพ์ไว้
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    run(async () => setTodos(await listTodos())).finally(() => setLoading(false));
  }, []);

  const replace = (t: Todo) => setTodos((list) => list.map((x) => (x.id === t.id ? t : x)));

  const add = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const t = await createTodo({ title });
      setTodos((list) => [...list, t]);
      setTitle("");
    });
  };

  const save = (e: FormEvent, id: number) => {
    e.preventDefault();
    return run(async () => {
      replace(await updateTodo(id, { title: editTitle }));
      setEditingId(null);
    });
  };

  return (
    <main>
      <h1>Todo</h1>
      <form className="row" onSubmit={add}>
        <label htmlFor="new-title">ชื่องาน</label>
        <input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" disabled={busy || title.trim() === ""}>เพิ่ม</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>กำลังโหลด…</p>
      ) : (
        <ul>
          {todos.map((t) => (
            <li key={t.id} className={t.done ? "done" : ""}>
              {editingId === t.id ? (
                <form className="row" onSubmit={(e) => save(e, t.id)}>
                  <input aria-label={`แก้ชื่อ ${t.title}`} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <button type="submit" disabled={busy}>บันทึก</button>
                </form>
              ) : (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={t.done}
                      disabled={busy}
                      onChange={() => run(async () => replace(await updateTodo(t.id, { done: !t.done })))}
                    />
                    <span>{t.title}</span>
                  </label>
                  <button type="button" disabled={busy} onClick={() => { setEditingId(t.id); setEditTitle(t.title); }}>
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(async () => { await deleteTodo(t.id); setTodos((l) => l.filter((x) => x.id !== t.id)); })}
                  >
                    ลบ
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
