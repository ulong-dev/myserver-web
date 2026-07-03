# myserver-web

เว็บ static รวมหลายหน้า พร้อม API สำหรับระบบตรวจเช็คถังดับเพลิง

## โครงสร้างโปรเจ็ค

```text
myserver/
├─ index.html                 # หน้าเว็บหลัก
├─ coffee-shop/               # เว็บร้านกาแฟ static
├─ fire-api/                  # Node.js API + dashboard ถังดับเพลิง
├─ guitar-learning/           # หน้าเรียนกีตาร์และฝึก scale
├─ library/                   # เว็บ library static
├─ running-app/               # เว็บ running app static
└─ space-game/                # เกม static
```

## Fire API

```bash
cd fire-api
npm install
npm start
```

ค่าเริ่มต้นของ API คือ `http://localhost:3000`

ไฟล์ที่ต้องมีในเครื่องแต่ไม่ควร commit:

- `fire-api/credentials.json`
- `.env` หรือ `.env.*`
- `fire-api/public/uploads/`

ตัวแปรแวดล้อมสำคัญดูตัวอย่างได้ที่ `fire-api/.env.example`

## Git hygiene

โปรเจ็คนี้ ignore ไฟล์ generated เช่น `node_modules/`, `.DS_Store`, log และรูปที่อัปโหลดแล้ว ให้ติดตั้ง dependency ใหม่ด้วย `npm install` จาก `fire-api/package-lock.json`
