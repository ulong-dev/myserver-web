# 🚨 คู่มือฉุกเฉิน: กู้คืนระบบ VS Code Remote Tunnel และ Home Server

อัปเดตล่าสุด: 2026-07-27

คู่มือนี้ใช้สำหรับเครื่อง iMac ของ `2pfamily` และโปรเจกต์ `myserver` เมื่อเกิดเหตุไฟตก เครื่องดับ รีสตาร์ทแล้วเข้า VS Code Tunnel ไม่ได้ หรือเว็บ/API ทำงานผิดปกติ

---

## 1. เช็กเร็วภายใน 2 นาที

ให้ไล่ตามลำดับนี้ก่อน อย่าเพิ่งแก้หลายอย่างพร้อมกัน

1. iMac เปิดอยู่และเข้า Desktop ของบัญชี `2pfamily` แล้ว
2. อินเทอร์เน็ตใช้งานได้
3. ปิด VS Code ที่เปิดค้างบน iMac ให้สนิท
4. เปิด Terminal บน iMac
5. เช็กว่า `code` ใช้ได้:

```bash
code --version
```

ถ้าขึ้น `command not found` ให้ไปหัวข้อ 3

---

## 2. แผนที่ระบบ

โปรเจกต์อยู่ที่:

```text
/Users/2pfamily/Library/Mobile Documents/com~apple~CloudDocs/myserver
```

โครงสร้างสำคัญ:

```text
myserver/
├─ index.html                         หน้า Home หลัก
├─ coffee-shop/                       POS ร้านกาแฟ
├─ guitar-learning/                   Guitar Learning 12 weeks / 84 days
├─ library/                           Library Lab
├─ running-app/                       Running Log + Dashboard
└─ space-game/                        Space Explorer
```

Fire API ถูกถอดออกจาก repository และเก็บแบบ private นอก iCloud ตั้งแต่
2026-07-27 เพราะไม่พบการใช้งานจริง

---

## 3. ซ่อมคำสั่ง `code`

ทำเฉพาะกรณี Terminal แจ้งว่า:

```text
-bash: code: command not found
```

ขั้นตอน:

1. เปิด VS Code บน iMac
2. กด `Cmd + Shift + P`
3. ค้นหา `code in path`
4. เลือก `Shell Command: Install 'code' command in PATH`
5. รอแจ้งเตือนว่า installed สำเร็จ
6. ปิด VS Code ให้สนิท
7. กลับไป Terminal แล้วลอง:

```bash
code --version
```

---

## 4. รีเซ็ต VS Code Remote Tunnel

ใช้เมื่อเข้า Tunnel จากเครื่องหลักไม่ได้ หรือไฟดับแล้ว Tunnel ไม่กลับมาเอง

```bash
code tunnel service uninstall
code tunnel service install
```

ถ้าสำเร็จ ควรเห็นข้อความใกล้เคียง:

```text
Service successfully installed!
Tunnel service successfully started
```

หลังเสร็จแล้วให้ปิด VS Code บน iMac อย่าเปิดค้างไว้

---

## 5. ยืนยันตัวตน GitHub สำหรับ Tunnel

ทำเมื่อ Terminal แจ้ง Error 401 หรือให้รหัส 8 หลัก เช่น `406E-CF5C`

1. เปิดเว็บ https://github.com/login/device
2. ใส่รหัส 8 หลักจาก Terminal
3. กด Continue และ Authorize
4. กลับไปดู Terminal บน iMac
5. รอจนเห็นว่า service started

---

## 6. เช็ก Git ว่า commit/push สำเร็จหรือยัง

เข้า root โปรเจกต์:

```bash
cd "/Users/2pfamily/Library/Mobile Documents/com~apple~CloudDocs/myserver"
```

เช็กสถานะ:

```bash
git status --short --branch
```

อ่านผลแบบเร็ว:

```text
## main...origin/main
```

แปลว่า clean และ sync แล้ว

```text
## main...origin/main [ahead 1]
```

แปลว่า commit แล้ว แต่ยังไม่ได้ push

```text
Changes to be committed
```

แปลว่า staged แล้ว แต่ยังไม่ได้ commit

```text
Changes not staged for commit
```

แปลว่าแก้ไฟล์แล้ว แต่ยังไม่ได้ stage

ดู commit ล่าสุด:

```bash
git log -5 --oneline --decorate
```

commit:

```bash
git add .
git commit -m "ข้อความสรุปงาน"
```

push:

```bash
git push
```

---

## 7. กฎเหล็ก

1. ห้าม commit ไฟล์ลับ เช่น `credentials.json`, `.env`, รูป upload จริง, log, `node_modules/`
2. อย่าใช้ `git reset --hard` ถ้าไม่แน่ใจ
3. ก่อน commit ให้เช็ก `git status --short --branch`
4. ถ้า VS Code เปิดหน้า `COMMIT_EDITMSG` แปลว่า commit อาจยังรอข้อความอยู่ ให้ใส่ข้อความ commit แล้ว save/close
5. หลังแก้เว็บ static ให้เช็ก path ของลิงก์แบบ relative เช่น `../index.html`

---

## 8. วิธีเข้าใช้งานปกติ

ใช้เครื่องหลักเข้า VS Code ผ่าน Tunnel ชื่อ:

```text
imac-khxng-2pfamily1
```

หรือเข้าใช้งานผ่าน `vscode.dev` แล้วเลือก Remote Tunnel เดียวกัน

หลังซ่อมเสร็จ ให้ปล่อย iMac อยู่หน้า Desktop และปิด VS Code ที่เปิดค้างบน iMac ให้เรียบร้อย
