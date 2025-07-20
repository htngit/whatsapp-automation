# WhatsApp Automation

A powerful WhatsApp automation tool built with Node.js, Express, Puppeteer, and React.

## 🚀 Quick Start

### Windows
1. **Install Dependencies:**
   ```bash
   install.bat
   ```

2. **Start Development Servers:**
   ```bash
   start-dev.bat
   ```

### Mac/Linux
1. **Make scripts executable:**
   ```bash
   chmod +x install.sh start-dev.sh
   ```

2. **Install Dependencies:**
   ```bash
   ./install.sh
   ```

3. **Start Development Servers:**
   ```bash
   ./start-dev.sh
   ```

## 📋 Prerequisites

- Node.js (v16 or higher)
- npm (comes with Node.js)
- Chrome/Chromium browser (for Puppeteer)

## 🌐 Access Points

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001

## 📁 Project Structure

```
whatsapp-automation/
├── backend/          # Express.js API server
├── frontend/         # React.js web interface
├── install.bat       # Windows installation script
├── install.sh        # Mac/Linux installation script
├── start-dev.bat     # Windows development server starter
├── start-dev.sh      # Mac/Linux development server starter
└── README.md         # This file
```

## 🛠️ Manual Installation

If you prefer to install manually:

### Backend
```bash
cd backend
npm install
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Aplikasi otomasi WhatsApp untuk mengirim pesan massal menggunakan CSV file.

## Fitur
- Upload CSV dengan data kontak dan pesan
- Inisialisasi WhatsApp Web otomatis
- Monitoring status WhatsApp real-time
- Pengiriman pesan otomatis
- Interface yang user-friendly

## Teknologi
- **Backend**: Node.js, Express, Puppeteer
- **Frontend**: React, Vite, TailwindCSS
- **Database**: Browser session storage

## Instalasi

### 1. Install Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

## Cara Menjalankan

### Opsi 1: Menggunakan Script Otomatis (Recommended)
```bash
# Double-click file start-dev.bat
# atau jalankan dari command prompt:
start-dev.bat
```

### Opsi 2: Manual

**1. Jalankan Backend Server:**
```bash
cd backend
npm start
```
Backend akan berjalan di `http://localhost:3001`

**2. Jalankan Frontend Server (terminal baru):**
```bash
cd frontend
npm run dev
```
Frontend akan berjalan di `http://localhost:3000`

## Konfigurasi Port

- **Backend Server**: Port 3001
- **Frontend Server**: Port 3000
- **Proxy Configuration**: Frontend menggunakan proxy untuk berkomunikasi dengan backend

### Troubleshooting Port Issues

Jika mengalami masalah koneksi:

1. **Pastikan backend berjalan di port 3001**
2. **Frontend menggunakan proxy configuration** di `vite.config.js`
3. **CORS sudah dikonfigurasi** untuk menerima request dari port 3000 dan 3002

## Format CSV

File CSV harus memiliki kolom berikut:
```csv
name,phone,message
John Doe,+6281234567890,Hello John!
Jane Smith,+6281234567891,Hi Jane!
```

## Cara Penggunaan

1. **Buka aplikasi** di browser (`http://localhost:3000`)
2. **Initialize WhatsApp** dengan klik tombol "Initialize WhatsApp"
3. **Scan QR Code** yang muncul di browser WhatsApp Web
4. **Upload CSV file** dengan format yang benar
5. **Start Automation** untuk mengirim pesan

## API Endpoints

- `GET /api/whatsapp-status` - Cek status WhatsApp
- `POST /api/init-whatsapp` - Inisialisasi WhatsApp Web
- `POST /send-messages` - Kirim pesan massal

## Struktur Project

```
whatsapp-automation/
├── backend/                 # Node.js backend server
│   ├── server.js           # Main server file
│   ├── package.json        # Backend dependencies
│   └── wa_session/         # WhatsApp session data
├── frontend/               # React frontend app
│   ├── src/
│   │   ├── App.jsx         # Main React component
│   │   └── ...
│   ├── vite.config.js      # Vite configuration with proxy
│   └── package.json        # Frontend dependencies
├── start-dev.bat           # Development startup script
└── README.md               # This file
```

## Catatan Penting

- **Browser Session**: WhatsApp session disimpan di `backend/wa_session/`
- **Headless Mode**: Browser berjalan dalam mode visible untuk scanning QR
- **Rate Limiting**: Gunakan delay yang wajar antar pesan untuk menghindari spam detection
- **Phone Format**: Nomor telepon harus dalam format internasional (+62xxx)

## Troubleshooting

### Frontend tidak bisa connect ke Backend
- Pastikan backend berjalan di port 3001
- Check proxy configuration di `vite.config.js`
- Restart kedua server

### WhatsApp tidak initialize
- Clear browser session: hapus folder `backend/wa_session/`
- Restart backend server
- Scan QR code lagi

### Error saat kirim pesan
- Pastikan WhatsApp Web sudah login
- Check format nomor telepon
- Pastikan koneksi internet stabil
