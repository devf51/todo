# Security

## ตรวจ design รอบ 1
- ผล: ผ่าน
- อ่าน: spec (approved), architecture (plan: draft), Produces ของ backend T2/T4/T6/T8/T10, frontend T3/T5/T7/T9, devops T1/T11
- ต้องแก้: -
- ควรแก้:
  - id / `category_id` ตัวเลขใหญ่เกิน int64 ทำให้ 500 · ใคร: คนนอกระบบ · ยังไง: `GET /api/todos?category_id=99999999999999999999` หรือ `DELETE /api/todos/<เลขใหญ่>` → pydantic ผ่าน (เป็น int) แต่ `sqlite3` โยน `OverflowError` (ยืนยันแล้วด้วย python ใน /tmp) · ได้อะไร: 500 + stack trace ใน log ไม่มีข้อมูลหลุด · แก้: ใส่ `ge=1, le=2**63-1` กับ path id, `category_id` (ทั้ง query และ body) ใน T2/T6/T8
  - PATCH ที่ส่ง `null` กับ field ที่ห้ามเป็น null (`title`, `done`, `priority`) และ body `{}` ยังไม่ได้กำหนดผล · ใคร: คนนอกระบบ · ยังไง: `PATCH {"priority": null}` หรือ `{}` · ได้อะไร: ถ้าประกอบ `UPDATE ... SET` แบบ dynamic จะได้ 500 (NOT NULL / SQL ว่าง) DB constraint ยังกันข้อมูลเสีย · แก้: ระบุใน T2/T4 ว่า null ของ 3 field นี้ → 422, `{}` → 200 คืนค่าเดิม, ชื่อคอลัมน์ใน SET มาจาก whitelist คงที่ของ model เท่านั้น (ไม่ใช่ key จาก body) และตั้ง `extra="forbid"` หรือเมิน key เกินแน่นอน
  - ไม่จำกัดขนาด body / จำนวนข้อมูลที่ระดับ app · ใคร: คนนอกระบบ · ยังไง: POST body ใหญ่มากหรือยิง todo ซ้ำๆ ไป port 8000 ที่เปิดตรง · ได้อะไร: container กิน RAM / disk เต็มจน service ล่ม (ไม่มีข้อมูลหลุด) · ผู้ใช้ยอมรับไว้ใน spec (ไม่ทำ rate limit) จึงไม่ใช่ "ต้องแก้" · แก้เล็กสุด: README ให้ bind `127.0.0.1:8000:8000` ใน compose เมื่อใช้ reverse proxy และตั้ง body limit ที่ proxy (T11 มีคำแนะนำอยู่แล้ว ให้ระบุให้ชัด)
  - dependency ยังไม่ได้ตรวจช่องโหว่ (ยังไม่มี lockfile / requirements) และเวอร์ชันใน architecture ตรวจจาก registry เท่านั้น · แก้: เพิ่มขั้น `pip-audit -r requirements.txt` และ `npm audit --omit=dev` ใน CI (T1) หรือให้ตรวจตอน branch review
  - CI workflow ควรตั้ง `permissions: contents: read` (T1) ลด token สิทธิ์เกินจำเป็น
- ข้อสังเกต:
  - no-auth + internet ตามที่ผู้ใช้ยอมรับ: ใครก็อ่าน / แก้ / ลบได้ และ `/docs` เปิดสาธารณะ ไม่นับเป็นข้อบกพร่อง
  - ตอน dev (`localhost:8000` ไม่มี CORS) เว็บอื่นข้ามไปเขียน API ไม่ได้สำหรับ PATCH/DELETE (ติด preflight) ความเสี่ยงต่ำ
  - base image ใช้ tag ไม่ pin digest

## ตรวจ branch รอบ 1
- ผล: ผ่าน
- ช่วงที่ตรวจ: ทั้ง branch `plan/todo-web` (origin/main ไม่มี merge base กับ branch นี้ จึงดูจาก commit แรก `8c5da64` ถึง HEAD `T10: รีวิวรอบ 1`) รวมไฟล์ T11 ที่ยังไม่ commit (Dockerfile, .dockerignore, docker-compose.yml, README.md, ci.yml) — T11 ยัง `in_progress` และยังไม่ได้ตรวจด้วย Docker จริง จึงตรวจเฉพาะตัวไฟล์
- ผลตรวจ design รอบ 1 ที่ "ควรแก้": ทำตามแล้วทั้งหมด (id/`category_id` ใช้ `ge=1, le=2**63-1`, PATCH null → 422 และ `{}` → 200, ชื่อคอลัมน์ใน SET มาจาก model, `pip-audit`/`npm audit`/`permissions: contents: read` อยู่ใน CI, compose bind `127.0.0.1` และ README ระบุ body limit 64 KB)
- ต้องแก้: -
- ควรแก้:
  - แก้ SQL ใน `PATCH /api/todos` ประกอบด้วย f-string จากคีย์ของ `changes` (backend/app/todos.py:124) ปลอดภัยเพราะคีย์มาจาก `model_dump` ของ `TodoPatch` เท่านั้น ยืนยันแล้ว: ส่ง key `"done = 1, title"` และ `"id"` → 200 ถูกเมิน ข้อมูลไม่เปลี่ยน · ถ้าภายหลังเพิ่ม `extra="allow"` จะกลายเป็น SQL injection จึงควรมีเทสต์กันไว้
  - ไม่มี dependency lock ของ Python (requirements pin เวอร์ชันแล้ว แต่ไม่มี hash) — `pip-audit` ผ่านวันนี้ ไม่มีช่องโหว่ที่ชี้ได้
- ข้อสังเกต:
  - ยืนยันแล้วด้วยการรันในเครื่อง: title/ชื่อหมวดที่เป็น SQL injection ถูกเก็บเป็นข้อความ ตารางไม่เสีย · `pip-audit -r requirements.txt` → No known vulnerabilities · `npm audit --omit=dev` → 0 vulnerabilities · static: `/../x.db`, `/%2e%2e/x.db` → 404 (T10 รีวิวยืนยันแล้ว) · frontend ไม่มี `dangerouslySetInnerHTML`/`innerHTML`/`eval` (React escape ให้) · ไม่มีไฟล์ secret/.env ใน git
  - no-auth + `/docs` เปิดสาธารณะตามที่ผู้ใช้ยอมรับใน spec (ไม่นับเป็นข้อบกพร่อง)
  - Dockerfile: ใช้ user ไม่ใช่ root (`USER app`) และ `/data` เป็นของ user นั้น แต่ยังไม่ได้ build/รันจริง (ยืนยันไม่ได้ว่า non-root เขียน volume ได้) · base image ใช้ tag ไม่ pin digest
