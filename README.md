# สัมผัสใจ · Mind Link

เกมเรียงไพ่ 2 คน สไตล์บอร์ดเกม The Mind — เล่นผ่านเว็บบราวเซอร์กับเพื่อนได้ไม่ต้องติดตั้งอะไร

## ✨ ฟีเจอร์

- 🎴 10 ด่าน (ด่าน 1 จั่ว 3 ใบ ไปจนถึงด่าน 10 จั่ว 12 ใบต่อคน)
- ❤️ หัวใจ 3 ดวง · 👁 ตัวช่วย 3 ครั้ง
- 🎁 โบนัสเมื่อผ่านด่าน (ด่าน 2, 3, 5, 7, 9)
- 🖱️ ลากวางไพ่ด้วยเมาส์หรือนิ้ว (มือถือใช้ได้)
- 👻 เห็นเพื่อนกำลังลากไพ่แบบ real-time
- 🔄 Sync ทันทีผ่าน Firebase Realtime Database

---

## 🚀 วิธี Deploy (ทำครั้งเดียวประมาณ 15–20 นาที)

### Step 1: สร้าง Firebase Project (ฟรี)

1. ไปที่ **https://console.firebase.google.com**
2. กด **"Add project"** → ตั้งชื่ออะไรก็ได้ เช่น `mind-link` → กด Continue
3. หน้า Google Analytics → **ปิด** (Disable) → Create project
4. รอสร้างเสร็จ → Continue

### Step 2: เปิด Realtime Database

1. ในหน้า project → เมนูซ้าย **Build** → **Realtime Database**
2. กด **"Create Database"**
3. เลือก location: **Singapore (asia-southeast1)** — ใกล้ไทยสุด
4. เลือก **"Start in test mode"** → Enable
5. หลังสร้างเสร็จ → ไปแท็บ **Rules** → วางโค้ดนี้:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

กด **Publish**

> ⚠️ หมายเหตุ: Rules นี้เปิดให้ใครก็เข้าถึงได้ — ใช้ได้สำหรับเกมส่วนตัวเล่นกับเพื่อน แต่ไม่เหมาะกับข้อมูลสำคัญ

### Step 3: ดึงค่า Firebase Config

1. ในหน้า project → กด ⚙️ **Project settings** (มุมซ้ายบน)
2. เลื่อนลงล่างจนเจอ **"Your apps"**
3. กดไอคอน **Web** (`</>`)
4. ตั้งชื่อ app อะไรก็ได้ เช่น `mind-link-web` → Register app
5. จะเห็นโค้ดแบบนี้ — **ก็อปส่วน `firebaseConfig`** ไว้:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "mind-link-xxxxx.firebaseapp.com",
  databaseURL: "https://mind-link-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mind-link-xxxxx",
  storageBucket: "mind-link-xxxxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef..."
};
```

> 📌 ถ้าไม่เห็นบรรทัด `databaseURL` ให้กลับไป Step 2 แล้วลองใหม่ บางครั้ง Firebase จะไม่ใส่ให้อัตโนมัติ

### Step 4: ใส่ค่า Config ในโปรเจค

1. เปิดไฟล์ `src/firebase.js`
2. แทนที่ `firebaseConfig` เดิม ด้วยค่าที่ก็อปมาจาก Step 3
3. Save

### Step 5: ติดตั้ง Node.js (ถ้ายังไม่มี)

- Windows/Mac: ดาวน์โหลดจาก https://nodejs.org (เลือก LTS)
- ตรวจสอบว่าติดตั้งได้: เปิด Terminal/Command Prompt แล้วพิมพ์ `node -v` ควรได้เวอร์ชัน v18 ขึ้นไป

### Step 6: ทดสอบในเครื่อง

เปิด Terminal ที่โฟลเดอร์โปรเจค แล้วพิมพ์:

```bash
npm install
npm run dev
```

เปิดเบราว์เซอร์ไปที่ URL ที่ขึ้นมา (มักจะเป็น `http://localhost:5173`) — ลองกดสร้างห้อง แล้วเปิดอีกแท็บใส่รหัสเข้าห้องดู ถ้าเข้าห้องสำเร็จ = Firebase เชื่อมได้!

### Step 7: Deploy บน Vercel (ฟรี, เร็ว)

#### วิธีที่ 1: ผ่าน Vercel CLI (แนะนำสำหรับผู้ใช้ Terminal)

```bash
npm install -g vercel
vercel login       # login ด้วย GitHub/Email
vercel             # ตอบ Y, Enter ตาม default ทุกข้อ
vercel --prod      # deploy เวอร์ชัน production
```

เสร็จ! จะได้ URL เช่น `https://mind-link-game.vercel.app` — ส่งให้เพื่อนเล่นได้เลย

#### วิธีที่ 2: ผ่าน GitHub (สำหรับคนที่อยากใช้ UI)

1. สร้าง repo บน GitHub แล้ว push โค้ดทั้งหมดขึ้นไป
2. ไปที่ https://vercel.com → Sign Up ด้วย GitHub
3. กด **"Add New..."** → **Project**
4. เลือก repo ที่เพิ่ง push → **Import**
5. Framework Preset: **Vite** (ควรตรวจจับอัตโนมัติ)
6. กด **Deploy** → รอประมาณ 1 นาที → เสร็จ!

---

## 🎮 วิธีเล่น

1. เปิด URL ที่ deploy แล้ว
2. คนแรก: กด **"สร้างห้องใหม่"** → ได้รหัสห้อง 4 ตัว เช่น `K7P2`
3. คนที่สอง: เปิด URL เดียวกัน ใส่รหัสห้อง → **"เข้าห้อง"**
4. เกมเริ่ม! ทั้งคู่จะได้ไพ่ในมือจั่วมาจากเลข 1-100
5. **ลากไพ่ไปวางในช่องกองกลาง** โดย:
   - เรียงจากน้อย (ซ้าย) ไปมาก (ขวา)
   - เว้นช่องว่างระหว่างไพ่ได้ (เพื่อเผื่อไพ่เพื่อน)
   - ลากไพ่ของตัวเองกลับมาในมือได้ ถ้าเปลี่ยนใจ
6. ห้ามคุยกันว่าไพ่อะไรอยู่ในมือ!
7. เมื่อวางครบทุกช่อง → กด **"เปิดไพ่ทั้งหมด"** → ถ้าเรียงถูกลำดับ = ขึ้นด่านใหม่

### ตัวช่วย 👁
กดปุ่ม **"ใช้ตัวช่วย"** → แตะไพ่ในสนาม 2 ใบ → เปิดหงายให้ทั้งคู่เห็นค่า

---

## 📁 โครงสร้างไฟล์

```
mind-link-deploy/
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── .gitignore
└── src/
    ├── main.jsx         ← entry point
    ├── App.jsx          ← โค้ดเกมทั้งหมด
    ├── index.css        ← tailwind
    └── firebase.js      ← 🔑 ต้องใส่ config ที่นี่
```

---

## ❓ ปัญหาที่พบบ่อย

**"กำลังรอเพื่อน..." ค้างไม่ขยับ**
- เช็คว่าใน `src/firebase.js` ใส่ `databaseURL` แล้ว
- เช็ค Realtime Database Rules เป็น `.read: true, .write: true`

**"สร้างห้องไม่สำเร็จ" / "ไม่พบห้องนี้"**
- เปิด DevTools (F12) → แท็บ Console → ดู error
- มักเป็นเพราะ config ผิด หรือ Rules ยังเป็น default (`.read: false`)

**Build error บน Vercel**
- ลอง `npm run build` ในเครื่องดูก่อนว่าผ่านมั้ย
- เช็คว่า push node_modules ขึ้น git หรือเปล่า (ต้องไม่ขึ้น — มี `.gitignore` กันอยู่แล้ว)

**เพื่อนเข้าห้องได้แต่เล่นแล้ว sync ช้า**
- ตรวจสอบว่าเลือก location ของ Database เป็น Singapore ไม่ใช่ US
- Firebase Free tier มี limit แต่สำหรับเล่น 2 คนไม่เกินชัวร์

---

## 💰 ค่าใช้จ่าย

- **Firebase Realtime Database (Spark/Free plan)**: ฟรี — 1GB storage, 10GB/เดือน download
- **Vercel Hobby plan**: ฟรี — unlimited deploy, 100GB bandwidth/เดือน

เกมนี้ใช้ข้อมูลน้อยมาก เล่นทั้งวันก็ไม่ถึง limit 🎉

สนุกกับเกมนะครับ ✦
