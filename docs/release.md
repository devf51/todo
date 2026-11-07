# Release: todo-web
- branch: plan/todo-web · base: main · commit ล่าสุด: `F5: qa รอบ 1`
- ผล: พร้อม (มีข้อยกเว้น: ยังไม่เคยตรวจด้วย Docker จริง — ดู "ที่ยังไม่ได้แก้")

## ผลรันรอบสุดท้าย
- `cd backend && .venv/bin/pytest -q` → 59 passed · `.venv/bin/ruff check .` → All checks passed
- `cd frontend && npm test` → 45 passed · `npm run build` → exit 0
- `cd e2e && CHROMIUM_PATH=/usr/bin/chromium npx playwright test` → 51 passed
- ไม่ได้ติดตั้งใหม่ทั้งหมดตาม "คำสั่ง" (ใช้ environment ที่มีอยู่) · `docker compose` ไม่ได้รัน (เครื่องเข้า Docker daemon ไม่ได้ และไม่มี compose plugin)

## สร้างอะไรไปบ้าง
- F1: API todo พื้นฐาน + หน้าเว็บเพิ่ม/ติ๊ก/แก้ชื่อ/ลบ (T1–T3)
- F2: วันกำหนดส่ง + ความสำคัญ + เรียงตามวันกำหนดส่ง (T4–T5)
- F3: หมวดหมู่ (สร้าง/เปลี่ยนชื่อ/ลบ) และผูกกับ todo (T6–T7)
- F4: ตัวกรองสถานะ / หมวด / ความสำคัญ (T8–T9)
- F5: เสิร์ฟหน้าเว็บจาก backend + Dockerfile, docker-compose, README, CI job docker (T10–T11)

## การตัดสินใจที่ทีมทำแทนคุณ
- T2/T4: validate `due_date` ด้วย `StrictStr` + regex + `date.fromisoformat`; `title`/`done`/`priority` เป็น `null` → 422; PATCH แยก "ไม่ส่ง" กับ `null`
- T6: ชื่อหมวดตัดช่องว่าง 1–50 ตัวอักษร, ชื่อซ้ำ → 409, ลบหมวดใช้ `ON DELETE SET NULL`
- T2 รอบ 2: แก้บั๊ก request พร้อมกันได้ 500 ด้วย `check_same_thread=False` (connection ต่อ request) — qa F2 พบ
- T7: รายการหมวดใช้ `role="group"` ไม่ใช้ `<li>` เพื่อไม่ปนกับรายการ todo
- T9: หลังเพิ่ม/แก้/ติ๊ก/ลบ โหลดรายการใหม่ด้วยตัวกรองปัจจุบัน แทนแก้ state ในเครื่อง
- T11: `.dockerignore` ตัด `docs`, `.github` เพิ่ม; ผู้ใช้สั่งให้ถือว่า T11 ผ่านทั้งที่ยังไม่ได้ตรวจ Docker จริง
- e2e: ใช้ `CHROMIUM_PATH=/usr/bin/chromium` เพราะติดตั้ง browser ของ Playwright ไม่ได้ (ต้อง sudo)

## ที่ยังไม่ได้แก้
- **ยังไม่ได้ตรวจ (T11/F5):** build image, `docker compose up`, ข้อมูลอยู่รอดผ่าน volume, user non-root เขียน `/data` ได้ — job `docker` ใน CI ตรวจแค่ `docker compose build`
- ควรแก้ (security): SQL ของ `PATCH /api/todos` ประกอบชื่อ field ด้วย f-string (ปลอดภัยเพราะ key มาจาก model) ควรมีเทสต์กัน `extra="allow"` · Python dependency ไม่มี hash lock
- ข้อสังเกต (reviewer T9): เปลี่ยนตัวกรองเร็วๆ response เก่าอาจทับของใหม่; ลบหมวดที่กำลังกรองอยู่ รายการว่างจนเลือก "ทั้งหมด"; ลบหมวดขณะฟอร์มแก้ todo เปิดอยู่ ค่าที่เลือกค้าง
- ข้อสังเกต (security): no-auth และ `/docs` เปิดสาธารณะตามที่ยอมรับใน spec · base image ไม่ pin digest · `origin/main` ไม่มี merge base กับ branch นี้

## คำอธิบาย PR
เว็บ todo (FastAPI + SQLite + React/Vite) ที่เพิ่มวันกำหนดส่ง ความสำคัญ หมวดหมู่ และตัวกรอง พร้อม Docker/compose สำหรับ deploy บน VPS

- F1 todo พื้นฐาน · F2 วันกำหนดส่ง/ความสำคัญ · F3 หมวดหมู่ · F4 ตัวกรอง · F5 Docker + README
- ทดสอบ: backend 59, frontend 45, e2e 51 ผ่าน; security ตรวจ branch ผ่าน
- วิธีลอง: ดู README (`docker compose up -d --build` แล้วเข้า `http://127.0.0.1:8000` ผ่าน reverse proxy)
- หมายเหตุ: ส่วน Docker ยังไม่ได้ตรวจด้วยเครื่องที่มี Docker จริง
