require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const creds = require('./credentials.json'); 
const app = express();

// --- การตั้งค่าที่จัดเก็บรูปภาพ ---
const uploadDir = './public/uploads';
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'fire-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use(express.static('public')); 

const doc = new GoogleSpreadsheet('1dmQbN90wkrxnwkejs_Iw_cHboTYp5q0fCE7M1kxVkL4');

// API Dashboard และ API ดึงข้อมูลรายถัง (เหมือนเดิม)
app.get('/api/dashboard/fire', async (req, res) => { /* ... โค้ดเดิม ... */ });
app.get('/api/fire/:id', async (req, res) => {
    const targetId = req.params.id;
    try {
        await doc.useServiceAccountAuth(creds);
        await doc.loadInfo();
        const sheet = doc.sheetsByTitle['Fire Database '];
        const rows = await sheet.getRows();
        const row = rows.find(r => r['fire_id'] === targetId);
        if (!row) return res.status(404).json({ success: false });
        const getV = (name) => {
            const key = Object.keys(row).find(k => k.trim() === name.trim());
            return key ? row[key] : null;
        };
        res.json({ success: true, data: { id: getV('fire_id'), location: getV('สถานที่ติดตั้ง'), type: getV('ชนิด') } });
    } catch (e) { res.status(500).json({ success: false }); }
});

// ✅ 3. API สำหรับบันทึกผล (รองรับการอัปโหลดรูปภาพ)
app.post('/api/check', upload.single('photo'), async (req, res) => {
    const data = req.body;
    const photoFile = req.file;
    
    // สร้าง URL ของรูปภาพ (เช่น http://localhost:3000/uploads/fire-xxx.jpg)
    const photoUrl = photoFile ? `${req.protocol}://${req.get('host')}/uploads/${photoFile.filename}` : '';

    console.log(`📸 ได้รับการตรวจถัง: ${data.id} พร้อมรูปภาพ: ${photoFile ? 'YES' : 'NO'}`);

    try {
        await doc.useServiceAccountAuth(creds);
        await doc.loadInfo();

        // 1. บันทึกลง Log
        const logSheet = doc.sheetsByTitle['Fire_collation _log'];
        await logSheet.addRow({
            'Log_ID': Math.random().toString(36).substr(2, 8).toUpperCase(),
            'วันที่': new Date().toLocaleDateString('th-TH'),
            'รหัสถัง': data.id,
            'สถานที่ติดตั้งปัจจุบัน': data.location,
            'สายฉีดดับเพลิง': data.hose,
            'คันบังคับ': data.lever,
            'แรงดัน/น้ำหนัก': data.pressure,
            'ลักษณะถัง': data.body,
            'สิ่งกีดขวาง': data.obstacle,
            'รายละเอียดอื่นๆ': data.remark,
            'ผู้ตรวจเช็ค': data.inspector,
            'ภาพถ่าย': photoUrl, // ✅ บันทึกลิงก์รูปลง Sheet
            'Latitude ': data.latitude,
            'Longitude ': data.longitude,
            'สถานะการตรวจเช็ค': data.status
        });

        // 2. อัปเดตฐานข้อมูล Master
        const mainSheet = doc.sheetsByTitle['Fire Database '];
        const rows = await mainSheet.getRows();
        const row = rows.find(r => r['fire_id'] === data.id);
        if (row) {
            row['สถานที่ติดตั้ง'] = data.location;
            row['สถานะการตรวจเช็ค'] = data.status;
            row['วันที่ตรวจล่าสุด'] = new Date().toLocaleDateString('th-TH');
            row['ภาพถ่าย'] = photoUrl; // ✅ อัปเดตรูปภาพล่าสุด
            row['Latitude'] = data.latitude;
            row['Longitude'] = data.longitude;
            await row.save();
        }

        res.json({ success: true, message: 'บันทึกข้อมูลและอัปโหลดรูปภาพเรียบร้อย' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 เซิร์ฟเวอร์รันที่ http://localhost:${PORT}`));