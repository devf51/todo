import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Filters from "./Filters";

const cats = [{ id: 1, name: "งาน" }, { id: 2, name: "บ้าน" }];

describe("Filters", () => {
  it("แสดงค่าปัจจุบันและตัวเลือก", () => {
    render(<Filters value={{ status: "done", category_id: 2, priority: "low" }} categories={cats} onChange={vi.fn()} />);
    expect(screen.getByLabelText("สถานะ")).toHaveDisplayValue("เสร็จแล้ว");
    expect(screen.getByLabelText("กรองหมวด")).toHaveDisplayValue("บ้าน");
    expect(screen.getByLabelText("กรองความสำคัญ")).toHaveDisplayValue("ต่ำ");
  });

  it("เปลี่ยนแต่ละตัว → onChange ด้วยค่าที่ถูก คงตัวอื่นไว้", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Filters value={{ priority: "high" }} categories={cats} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("สถานะ"), "ยังไม่เสร็จ");
    expect(onChange).toHaveBeenLastCalledWith({ priority: "high", status: "active" });
    await user.selectOptions(screen.getByLabelText("กรองหมวด"), "งาน");
    expect(onChange).toHaveBeenLastCalledWith({ priority: "high", category_id: 1 });
  });

  it("เลือก ทั้งหมด → ตัดค่านั้นออกจาก filters", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Filters value={{ category_id: 1, priority: "high" }} categories={cats} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("กรองหมวด"), "ทั้งหมด");
    expect(onChange).toHaveBeenLastCalledWith({ priority: "high" });
    await user.selectOptions(screen.getByLabelText("กรองความสำคัญ"), "ทั้งหมด");
    expect(onChange).toHaveBeenLastCalledWith({ category_id: 1 });
  });
});
