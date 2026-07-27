# myserver-web

Monorepo ส่วนตัวสำหรับเว็บและ API หลายระบบ โดย GitHub Pages ต้องเผยแพร่เฉพาะ
artifact ที่ผ่าน allowlist เท่านั้น

## โครงสร้างโปรเจ็ค

```text
myserver/
├─ public-site/               # หน้าแรกสำหรับ GitHub Pages
├─ index.html                 # หน้า Home ภายในระบบส่วนตัว
├─ coffee-shop/               # เว็บร้านกาแฟ static
├─ guitar-learning/           # หน้าเรียนกีตาร์และฝึก scale
├─ library/                   # เว็บ library static
├─ running-app/               # เว็บ running app static
├─ typing-trainer/            # โปรแกรมฝึกพิมพ์ไทย/อังกฤษ static
└─ space-game/                # เกม static
```

## ระบบที่เก็บเข้าคลัง

Fire API ถูกถอดออกจาก repository เมื่อ 2026-07-27 เนื่องจากไม่พบการใช้งานจริง
และเก็บแบบ private นอก iCloud ที่
`~/.config/myserver/archive/fire-api-2026-07-27/` ห้ามนำกลับมารันโดยใช้
credential เดิม ต้องตรวจ sharing ของ `fire_DB` และออก credential ใหม่ก่อนเสมอ

## GitHub Pages

`.github/workflows/pages.yml` สร้าง `_site` จาก allowlist ต่อไปนี้เท่านั้น:

- `guitar-learning/`
- `space-game/`
- `typing-trainer/`

Running, Library, Coffee POS, API/backend, runbook และไฟล์ operation ต้องไม่อยู่ใน
Pages artifact รันคำสั่งนี้เพื่อตรวจในเครื่อง:

```bash
node scripts/build-public-site.mjs
node scripts/verify-public-site.mjs _site
```

## Git hygiene

โปรเจ็คนี้ ignore ไฟล์ generated และไฟล์ลับ เช่น `node_modules/`, `.DS_Store`,
log, `_site` และ `.env*`
