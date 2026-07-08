# กระดานแชมป์ · ต้นและเพชร Tennis Club

เว็บไซต์จัดอันดับ (leaderboard) ของ **ต้นและเพชร Tennis Club** — โชว์ว่าใครตีเทนนิสได้คะแนนดีที่สุด
ในสไตล์จอถ่ายทอดสดทัวร์นาเมนต์ (ATP finals): ชื่อผู้เล่นตัวใหญ่เด่น ๆ, **โพเดียมแชมป์** Top 3
พร้อมถ้วยรางวัลและแสงทองรอบอันดับ 1, และตารางอันดับทั้งหมด แยกเป็น **ประจำวัน / ประจำสัปดาห์ / ประจำเดือน**

> แบรนด์: **"ต้นและเพชร Tennis Club"** เท่านั้น (ห้ามใช้ "ต้นเป็ด" / "TonPed")

## ภาพหน้าจอ

<!-- screenshot placeholder: docs/screenshot.png (podium + standings, dark court-night theme) -->
_(ใส่ภาพหน้าจอตรงนี้)_

## รันในเครื่อง

```bash
npm install
npm run dev        # เปิด http://localhost:5174 (proxy /api → :8080)

# รัน API server (อีก terminal) — อ่าน DATABASE_URL จาก ../tennis_project01/.env.local
# แล้ว export ในเชลล์เท่านั้น ห้าม commit ค่าจริง
DATABASE_URL="…" PORT=8080 node server/index.mjs
```

ตรวจ 3 gate ให้ผ่านก่อน commit/deploy เสมอ:

```bash
npm run typecheck && npm run test && npm run build
```

## สถาปัตยกรรมข้อมูล (สรุป)

ฐานข้อมูลต้นทาง (Supabase Postgres ที่ใช้ร่วมกับแอปหลัก) จะ **ลบ session ที่เก่ากว่า 3 วันทิ้ง** —
เว็บนี้จึงมีตารางถาวรของตัวเอง `leaderboard_records` (1 แถวต่อ 1 session, ไม่เคยลบ) เขียนโดยแอปหลัก
ตอนจบเซสชัน + มี backfill สำรอง (boot / รายชั่วโมง / on-demand) จาก sessions⋈shots ย้อนหลัง 3 วัน
วันแบ่งตามเวลาไทย (Asia/Bangkok) รายละเอียดเต็มดูใน `CLAUDE.md`

## Deploy

Cloud Run · image `asia-southeast1-docker.pkg.dev/ton-team/ton-phet/ranking:v1` · service
`ton-phet-ranking` · region `asia-southeast1` · ต้องตั้ง env `DATABASE_URL` (ดู `CLAUDE.md`)
