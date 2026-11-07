import { useEffect, useState, type FormEvent } from "react";
import { ApiError, createTodo, deleteTodo, listCategories, listTodos, updateTodo, type Category, type Todo } from "./api";
import Categories from "./Categories";
import "./App.css";

const PRIORITY_TH = { low: "ต่ำ", medium: "ปานกลาง", high: "สูง" } as const;

function DueAndPriority(props: {
  due: string;
  priority: Todo["priority"];
  onDue: (v: string) => void;
  onPriority: (v: Todo["priority"]) => void;
  idPrefix: string;
}) {
  return (
    <>
      <label htmlFor={`${props.idPrefix}-due`}>วันกำหนดส่ง</label>
      <input id={`${props.idPrefix}-due`} type="date" value={props.due} onChange={(e) => props.onDue(e.target.value)} />
      <label htmlFor={`${props.idPrefix}-prio`}>ความสำคัญ</label>
      <select
        id={`${props.idPrefix}-prio`}
        value={props.priority}
        onChange={(e) => props.onPriority(e.target.value as Todo["priority"])}
      >
        {Object.entries(PRIORITY_TH).map(([v, th]) => (
          <option key={v} value={v}>{th}</option>
        ))}
      </select>
    </>
  );
}

function CategorySelect(props: { id: string; categories: Category[]; value: string; onChange: (v: string) => void }) {
  return (
    <>
      <label htmlFor={props.id}>หมวด</label>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">ไม่มีหมวด</option>
        {props.categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </>
  );
}

export default function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<Todo["priority"]>("medium");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const [editPriority, setEditPriority] = useState<Todo["priority"]>("medium");

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

  const reload = () =>
    run(async () => {
      const [c, t] = await Promise.all([listCategories(), listTodos()]);
      setCategories(c);
      setTodos(t);
    });

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const categoryName = (id: number | null) => {
    const c = categories.find((x) => x.id === id);
    return c ? `หมวด: ${c.name}` : "ไม่มีหมวด";
  };

  const replace = (t: Todo) => setTodos((list) => list.map((x) => (x.id === t.id ? t : x)));

  const add = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      const t = await createTodo({ title, due_date: due || null, priority, category_id: categoryId ? Number(categoryId) : null });
      setTodos((list) => [...list, t]);
      setTitle("");
      setDue("");
      setPriority("medium");
      setCategoryId("");
    });
  };

  const save = (e: FormEvent, id: number) => {
    e.preventDefault();
    return run(async () => {
      replace(await updateTodo(id, {
        title: editTitle,
        due_date: editDue || null,
        priority: editPriority,
        category_id: editCategoryId ? Number(editCategoryId) : null,
      }));
      setEditingId(null);
    });
  };

  return (
    <main>
      <h1>Todo</h1>
      <form className="row" onSubmit={add}>
        <label htmlFor="new-title">ชื่องาน</label>
        <input id="new-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <DueAndPriority idPrefix="new" due={due} priority={priority} onDue={setDue} onPriority={setPriority} />
        <CategorySelect id="new-category-select" categories={categories} value={categoryId} onChange={setCategoryId} />
        <button type="submit" disabled={busy || title.trim() === ""}>เพิ่ม</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <Categories categories={categories} onChange={reload} />
      {loading ? (
        <p>กำลังโหลด…</p>
      ) : (
        <ul>
          {todos.map((t) => (
            <li key={t.id} className={t.done ? "done" : ""}>
              {editingId === t.id ? (
                <form className="row" onSubmit={(e) => save(e, t.id)}>
                  <input aria-label={`แก้ชื่อ ${t.title}`} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <DueAndPriority idPrefix={`edit-${t.id}`} due={editDue} priority={editPriority} onDue={setEditDue} onPriority={setEditPriority} />
                  <CategorySelect id={`edit-${t.id}-category`} categories={categories} value={editCategoryId} onChange={setEditCategoryId} />
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
                  <small>
                    {t.due_date && <>ครบกำหนด {t.due_date} · </>}ความสำคัญ: {PRIORITY_TH[t.priority]} · {categoryName(t.category_id)}
                  </small>
                  <button type="button" disabled={busy} onClick={() => { setEditingId(t.id); setEditTitle(t.title); setEditDue(t.due_date ?? ""); setEditPriority(t.priority); setEditCategoryId(t.category_id === null ? "" : String(t.category_id)); }}>
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
