require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const creds = require('./credentials.json'); 
const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const staffPassword = process.env.STAFF_PASSWORD || '1234';
const authSecret = process.env.AUTH_SECRET || `${staffPassword}:${creds.private_key || 'local-secret'}`;
const tokenTtlMs = Number(process.env.AUTH_TOKEN_TTL_MS || 12 * 60 * 60 * 1000);
const uploadMaxBytes = Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024);

if (!process.env.STAFF_PASSWORD) {
    console.warn('⚠️  STAFF_PASSWORD is not set. Using default local password.');
}

// --- การตั้งค่าที่จัดเก็บรูปภาพ ---
const uploadDir = path.join(__dirname, 'public', 'uploads');
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
const upload = multer({
    storage: storage,
    limits: { fileSize: uploadMaxBytes },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
        const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);
        const extension = path.extname(file.originalname).toLowerCase();

        if (!allowedMimeTypes.has(file.mimetype) || !allowedExtensions.has(extension)) {
            return cb(new Error('รองรับเฉพาะไฟล์รูปภาพ JPG, PNG หรือ WEBP'));
        }

        cb(null, true);
    }
});

if (allowedOrigins.length > 0) {
    app.use(cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            callback(new Error('CORS origin is not allowed'));
        }
    }));
}
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); 

const doc = new GoogleSpreadsheet('1dmQbN90wkrxnwkejs_Iw_cHboTYp5q0fCE7M1kxVkL4');

async function loadMainSheetRows() {
    await doc.useServiceAccountAuth(creds);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Fire Database '];
    if (!sheet) {
        throw new Error('ไม่พบชีต Fire Database');
    }
    return sheet.getRows();
}

function getRowValue(row, names) {
    const keys = Object.keys(row);
    for (const name of names) {
        const key = keys.find(k => k.trim() === name.trim());
        if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') {
            return row[key];
        }
    }
    return '';
}

function parseCoordinate(value) {
    if (!value) return null;
    const parsed = Number(String(value).trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFireRow(row) {
    return {
        id: getRowValue(row, ['fire_id', 'รหัสถัง']),
        location: getRowValue(row, ['สถานที่ติดตั้ง']),
        type: getRowValue(row, ['ชนิด', 'ประเภท']),
        size: getRowValue(row, ['ขนาด', 'ขนาดถัง']),
        weight: getRowValue(row, ['น้ำหนัก', 'ขนาด/น้ำหนัก']),
        fillDate: getRowValue(row, ['วันบรรจุ', 'Fill Date']),
        expireDate: getRowValue(row, ['วันหมดอายุ', 'Expire Date']),
        status: getRowValue(row, ['สถานะการตรวจเช็ค', 'สถานะภาพรวม']) || 'ไม่ระบุ',
        currentMonthStatus: getRowValue(row, ['สถานะเดือนนี้']) || 'ยังไม่ตรวจเดือนนี้',
        lastCheckDate: getRowValue(row, ['วันที่ตรวจล่าสุด', 'ตรวจล่าสุด']),
        photoUrl: getRowValue(row, ['ภาพถ่าย', 'รูปภาพ']),
        lat: parseCoordinate(getRowValue(row, ['Latitude', 'Latitude '])),
        lng: parseCoordinate(getRowValue(row, ['Longitude', 'Longitude ']))
    };
}

function signToken(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', authSecret).update(body).digest('base64url');
    return `${body}.${signature}`;
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left));
    const rightBuffer = Buffer.from(String(right));

    if (leftBuffer.length !== rightBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyToken(token) {
    if (!token || !token.includes('.')) return null;
    const [body, signature] = token.split('.');
    const expectedSignature = crypto.createHmac('sha256', authSecret).update(body).digest('base64url');

    if (!safeEqual(signature, expectedSignature)) {
        return null;
    }

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
        if (!payload.exp || Date.now() > payload.exp) return null;
        return payload;
    } catch (error) {
        return null;
    }
}

function requireAuth(req, res, next) {
    const authHeader = req.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const payload = verifyToken(token);

    if (!payload) {
        return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบใหม่' });
    }

    req.auth = payload;
    next();
}

function sanitizeText(value, maxLength = 250) {
    return String(value || '').trim().slice(0, maxLength);
}

function validateInspection(data) {
    const allowedStatus = new Set(['พร้อมใช้งาน', 'ชำรุด']);
    const requiredFields = ['id', 'location', 'inspector', 'hose', 'lever', 'pressure', 'body', 'obstacle', 'status'];

    for (const field of requiredFields) {
        if (!sanitizeText(data[field])) {
            return `กรุณากรอกข้อมูล ${field}`;
        }
    }

    if (!allowedStatus.has(data.status)) {
        return 'สถานะการตรวจเช็คไม่ถูกต้อง';
    }

    return null;
}

app.post('/api/auth', (req, res) => {
    const password = String(req.body?.password || '');

    if (!safeEqual(password, staffPassword)) {
        return res.status(401).json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' });
    }

    res.json({
        success: true,
        token: signToken({ role: 'staff', exp: Date.now() + tokenTtlMs })
    });
});

// API Dashboard และ API ดึงข้อมูลรายถัง
app.get('/api/dashboard/fire', async (req, res) => {
    try {
        const rows = await loadMainSheetRows();
        const list = rows.map(normalizeFireRow).filter(item => item.id);
        const ready = list.filter(item => item.status === 'พร้อมใช้งาน').length;

        res.json({
            success: true,
            data: {
                total: list.length,
                ready,
                broken: list.length - ready,
                lastUpdate: new Date().toLocaleString('th-TH'),
                list
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.get('/api/fire/:id', async (req, res) => {
    const targetId = req.params.id;
    try {
        const rows = await loadMainSheetRows();
        const row = rows.find(r => getRowValue(r, ['fire_id', 'รหัสถัง']) === targetId);
        if (!row) return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลถังดับเพลิง' });
        res.json({ success: true, data: normalizeFireRow(row) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ✅ 3. API สำหรับบันทึกผล (รองรับการอัปโหลดรูปภาพ)
app.post('/api/check', requireAuth, upload.single('photo'), async (req, res) => {
    const data = {
        id: sanitizeText(req.body.id, 80),
        location: sanitizeText(req.body.location, 300),
        inspector: sanitizeText(req.body.inspector, 120),
        hose: sanitizeText(req.body.hose, 80),
        lever: sanitizeText(req.body.lever, 80),
        pressure: sanitizeText(req.body.pressure, 80),
        body: sanitizeText(req.body.body, 80),
        obstacle: sanitizeText(req.body.obstacle, 100),
        remark: sanitizeText(req.body.remark, 500),
        status: sanitizeText(req.body.status, 80),
        latitude: sanitizeText(req.body.latitude, 40),
        longitude: sanitizeText(req.body.longitude, 40)
    };
    const photoFile = req.file;
    const validationError = validateInspection(data);

    if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
    }
    
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

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        const message = error.code === 'LIMIT_FILE_SIZE'
            ? `ไฟล์รูปภาพต้องมีขนาดไม่เกิน ${Math.round(uploadMaxBytes / 1024 / 1024)}MB`
            : error.message;
        return res.status(400).json({ success: false, message });
    }

    if (error) {
        return res.status(400).json({ success: false, message: error.message });
    }

    next();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 เซิร์ฟเวอร์รันที่ http://localhost:${PORT}`));
