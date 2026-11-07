import { useState, type FormEvent } from "react";
import { ApiError, createCategory, deleteCategory, renameCategory, type Category } from "./api";

export default function Categories(props: { categories: Category[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // เรียก onChange หลัง server ตอบสำเร็จเท่านั้น; error → alert และคงค่าที่พิมพ์ไว้
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      props.onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  const add = (e: FormEvent) => {
    e.preventDefault();
    return run(async () => {
      await createCategory(name);
      setName("");
    });
  };

  const save = (e: FormEvent, id: number) => {
    e.preventDefault();
    return run(async () => {
      await renameCategory(id, editName);
      setEditingId(null);
    });
  };

  return (
    <section>
      <h2>หมวด</h2>
      <form className="row" onSubmit={add}>
        <label htmlFor="new-category">ชื่อหมวด</label>
        <input id="new-category" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" disabled={busy || name.trim() === ""}>เพิ่มหมวด</button>
      </form>
      {error && <p role="alert">{error}</p>}
      <div>
        {props.categories.map((c) => (
          <div key={c.id} role="group" aria-label={c.name} className="cat">
            {editingId === c.id ? (
              <form className="row" onSubmit={(e) => save(e, c.id)}>
                <input aria-label={`ชื่อใหม่ของ ${c.name}`} value={editName} onChange={(e) => setEditName(e.target.value)} />
                <button type="submit" disabled={busy}>บันทึก</button>
              </form>
            ) : (
              <>
                <span>{c.name}</span>
                <button type="button" disabled={busy} onClick={() => { setEditingId(c.id); setEditName(c.name); }}>
                  เปลี่ยนชื่อ
                </button>
                <button type="button" disabled={busy} onClick={() => run(() => deleteCategory(c.id))}>
                  ลบหมวด
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
