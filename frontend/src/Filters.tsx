import type { Category, TodoFilters } from "./api";

const STATUS_TH = { all: "ทั้งหมด", active: "ยังไม่เสร็จ", done: "เสร็จแล้ว" } as const;
const PRIORITY_TH = { low: "ต่ำ", medium: "ปานกลาง", high: "สูง" } as const;

// "ทั้งหมด" = ตัดค่านั้นออกจาก filters เพื่อไม่ส่ง query
function without(f: TodoFilters, key: keyof TodoFilters): TodoFilters {
  const { [key]: _removed, ...rest } = f;
  return rest;
}

export default function Filters(props: { value: TodoFilters; categories: Category[]; onChange: (f: TodoFilters) => void }) {
  const { value, onChange } = props;
  return (
    <div className="row">
      <label htmlFor="f-status">สถานะ</label>
      <select
        id="f-status"
        value={value.status ?? "all"}
        onChange={(e) => onChange(e.target.value === "all" ? without(value, "status") : { ...value, status: e.target.value as keyof typeof STATUS_TH })}
      >
        {Object.entries(STATUS_TH).map(([v, th]) => (
          <option key={v} value={v}>{th}</option>
        ))}
      </select>
      <label htmlFor="f-category">กรองหมวด</label>
      <select
        id="f-category"
        value={value.category_id ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? without(value, "category_id") : { ...value, category_id: Number(e.target.value) })}
      >
        <option value="">ทั้งหมด</option>
        {props.categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <label htmlFor="f-priority">กรองความสำคัญ</label>
      <select
        id="f-priority"
        value={value.priority ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? without(value, "priority") : { ...value, priority: e.target.value as keyof typeof PRIORITY_TH })}
      >
        <option value="">ทั้งหมด</option>
        {Object.entries(PRIORITY_TH).map(([v, th]) => (
          <option key={v} value={v}>{th}</option>
        ))}
      </select>
    </div>
  );
}
