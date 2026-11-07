# Nền Tảng Chatbox Tư Vấn Sản Phẩm & Đặt Lịch Tự Động (AI + Nhân Viên)

Hệ thống website tư vấn sản phẩm toàn diện, tích hợp trợ lý AI thông minh qua Tool Calling (Function Calling), tự động kiểm tra khung giờ trống và đặt lịch hẹn tư vấn cho khách hàng. Hệ thống hỗ trợ chuyển giao trực tiếp (Human Handoff) sang nhân viên trực hỗ trợ qua kết nối thời gian thực Socket.IO khi khách yêu cầu, đi kèm bảng điều khiển quản trị (Admin Dashboard) chuyên sâu.

> [!NOTE]
> **Dự án chạy hoàn toàn trực tiếp trên máy cục bộ (Local), sử dụng cơ chế lưu trữ Mock JSON bền vững (Persistent) trong thư mục `database/data/`. Không cần cài đặt PostgreSQL.**

---

## 1. Mô tả dự án

Hệ thống được thiết kế nhằm tự động hóa quy trình chăm sóc khách hàng và bán hàng cho các doanh nghiệp:
- **Tư vấn sản phẩm thông minh:** Trợ lý AI trả lời câu hỏi của khách hàng, gợi ý cấu hình, báo giá và so sánh sản phẩm dựa trên dữ liệu sản phẩm.
- **Đặt lịch tư vấn thông qua AI (Tool Calling) & Biểu mẫu trực tuyến:** Tự động tra cứu lịch làm việc của công ty (`check_available_slots`) và chốt lịch hẹn cho khách (`create_appointment`).
- **Chuyển giao mượt mà sang nhân viên (Live Support Handoff):** Khách hàng hoặc AI có thể bấm chuyển kênh để kết nối tới nhân viên tư vấn. Toàn bộ lịch sử hội thoại trước đó với AI được bảo toàn nguyên vẹn.
- **Hệ thống phân quyền 4 nhóm đối tượng (RBAC):**
  1. **Admin (Quản trị viên):** Toàn quyền quản trị hệ thống, quản lý tài khoản người dùng/nhân viên/lễ tân, duyệt và quản lý toàn bộ lịch hẹn, cấu hình giờ làm việc và hệ thống.
  2. **Receptionist (Nhân viên lễ tân):** Xem danh sách lịch hẹn, xem chi tiết thông tin khách hàng, tìm kiếm và lọc lịch theo ngày/giờ/trạng thái. Bị giới hạn quyền nghiêm ngặt: không được sửa trạng thái/hủy lịch và không được vào khu vực quản trị tài khoản, cài đặt hệ thống của Admin.
  3. **Guest (Khách vãng lai):** Xem trang công khai, sản phẩm và đặt lịch hẹn không cần tạo tài khoản (sử dụng phiên guest session).
  4. **User (Khách hàng đã đăng nhập):** Có thể đăng ký tài khoản, đăng nhập. Khi đặt lịch hẹn, hệ thống tự động điền sẵn thông tin liên hệ từ tài khoản và liên kết lịch hẹn với `user_id`. Khách hàng có thể xem lịch sử các lịch hẹn của chính mình (`/my-appointments`).

---

## 2. Công nghệ sử dụng

- **Backend Runtime:** Node.js (v18+)
- **Web Framework:** Express.js 4.x
- **Giao thức thời gian thực:** Socket.IO 4.x (WebSockets với fallback long-polling)
- **Cơ chế lưu trữ dữ liệu:** **Mock JSON bền vững (Persistent JSON Store)** lưu trữ trong `database/data/*.json`, hỗ trợ atomic write, cache in-memory và giao dịch mô phỏng (Transaction rollback).
- **Bảo mật:** Helmet, CORS, Cookie-parser, Bcrypt.js (12 salt rounds), JSON Web Tokens (JWT), Express-Rate-Limit
- **AI Integration:** OpenAI API compatible client (Tương thích chuẩn OpenAI API, Ollama cục bộ, vLLM, DeepSeek)
- **Môi trường vận hành:** **Chạy trực tiếp trên máy cục bộ (Local)**
- **Test Runner:** Node.js Built-in Test Runner (`node:test` & `node:assert`)

---

## 3. Kiến trúc tổng thể

```
+-------------------------------------------------------------------------+
|                         Frontend Client (SPA)                           |
|      (Giao diện khách hàng: Đặt lịch, Xem sản phẩm, Chatbox AI/Staff)    |
|      (Giao diện Quản trị: Admin Dashboard, Lễ tân xem lịch, Nhân sự)    |
+-------------------------------------------------------------------------+
                                 ▲        ▲
                     HTTP / REST |        | WebSockets (Socket.IO)
                                 ▼        ▼
+-------------------------------------------------------------------------+
|                           Backend (Express.js)                          |
|  - Middleware: Auth (RBAC), GuestSession, Security (Helmet, RateLimit)  |
|  - Routes: /api/auth, /api/products, /api/conversations, /api/appts    |
|  - Chat Socket Handler: Room-based routing (guest, agent queue, staff)  |
+-------------------------------------------------------------------------+
       |                                                |
       ▼                                                ▼
+-----------------------+                    +----------------------------+
|  AI Orchestrator      |                    |     Service & Repositories |
|  - Tool Definitions   |                    |  - Concurrency Lock (409)  |
|  - Context Builder    |                    |  - Working Hours Validator |
|  - Agentic Tool Loop  |                    |  - RBAC & Role Permission  |
+-----------------------+                    +----------------------------+
       |                                                |
       ▼                                                ▼
+-----------------------+                    +----------------------------+
|  AI Provider Engine   |                    |      Mock JSON Store       |
| (Ollama Local/OpenAI) |                    |  (database/data/*.json)    |
+-----------------------+                    +----------------------------+
```

---

## 4. Cấu trúc thư mục

```
chatbox/
├── .env.example              # Mẫu file cấu hình biến môi trường
├── .env                      # File biến môi trường thực tế
├── package.json              # Khai báo dependencies và scripts
├── database/                 # Quản lý cơ sở dữ liệu Mock JSON
│   ├── data/                 # Thư mục chứa các file dữ liệu .json bền vững
│   │   ├── users.json
│   │   ├── categories.json
│   │   ├── products.json
│   │   ├── conversations.json
│   │   ├── messages.json
│   │   ├── appointments.json
│   │   ├── business_settings.json
│   │   └── system_settings.json
│   ├── migrate.js            # Khởi tạo schema và collections Mock JSON
│   ├── seed.js               # Nạp dữ liệu mẫu ban đầu (Sản phẩm, danh mục, tài khoản)
│   └── seedAdmin.js          # Khởi tạo / cập nhật tài khoản quản trị Admin
├── public/                   # Frontend tĩnh cho khách hàng và quản trị
│   ├── index.html            # Trang chủ cửa hàng
│   ├── products.html         # Danh mục sản phẩm
│   ├── product-detail.html   # Chi tiết sản phẩm
│   ├── account.html          # Đăng ký, đăng nhập và tài khoản khách hàng
│   ├── chat.html             # Giao diện chat toàn màn hình
│   └── admin/                # Bảng điều khiển quản trị (Admin & Receptionist)
│       ├── dashboard.html    # Báo cáo tổng quan (Admin & Staff)
│       ├── appointments.html # Quản lý lịch hẹn (Admin duyệt, Lễ tân xem)
│       ├── chat.html         # Bàn trực chat tư vấn
│       ├── staff.html        # Quản lý tài khoản & phân quyền (Admin)
│       └── settings.html     # Cài đặt giờ làm việc & hệ thống (Admin)
├── src/                      # Source code Backend
│   ├── app.js                # Entry point server Express & Socket.IO
│   ├── config/               # Cấu hình hệ thống, JWT và jsonStore
│   ├── middleware/           # Middleware xác thực JWT, RBAC, phân quyền
│   ├── repositories/         # Tầng lưu trữ dữ liệu Mock JSON
│   ├── services/             # Nghiệp vụ đặt lịch, xác thực, hội thoại
│   └── routes/               # API endpoints
├── scripts/                  # Scripts tiện ích sao lưu & phục hồi dữ liệu
│   ├── backup-db.ps1 / .sh   # Sao lưu database/data/ thành file nén zip/tar
│   └── restore-db.ps1 / .sh  # Phục hồi dữ liệu từ bản sao lưu
└── tests/                    # Bộ kiểm thử tích hợp tự động
```

---

## 5. Yêu cầu môi trường

- **Hệ điều hành:** Windows, macOS, hoặc Linux.
- **Node.js:** Phiên bản `>= 18.0.0` (khuyến nghị Node.js 20 hoặc 22 LTS).
- **Mô hình AI (Tùy chọn):** Cài đặt **Ollama** trên máy host (`http://localhost:11434/v1`) hoặc API Key OpenAI. *(Nếu không có AI, hệ thống vẫn hoạt động đầy đủ chức năng đặt lịch, chat với nhân viên và quản trị).*
- **Không yêu cầu cài đặt cơ sở dữ liệu PostgreSQL bên ngoài.**

---

## 6. Hướng dẫn cài đặt và chạy trên Local

### Bước 1: Cài đặt dependencies
Mở terminal tại thư mục dự án và chạy:
```bash
npm install
```

### Bước 2: Cấu hình biến môi trường
Tạo file `.env` từ file mẫu `.env.example`:
- Trên Windows PowerShell:
  ```powershell
  Copy-Item .env.example .env
  ```
- Hoặc trên Bash/Linux:
  ```bash
  cp .env.example .env
  ```

File `.env` mẫu đã được cấu hình tối ưu sẵn để chạy local:
```ini
NODE_ENV=development
PORT=3000

JWT_SECRET=dev-jwt-secret-change-in-production-minimum-32chars
JWT_EXPIRES_IN=7d

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin@123456
ADMIN_NAME=Administrator

# ==============================================================================
# Cấu hình AI Provider: 'gemini' (Google Cloud AI) hoặc 'ollama' (Local AI)
# ==============================================================================
AI_PROVIDER=gemini

# Cấu hình Google Gemini (Cloud AI)
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta

# Cấu hình Ollama (Local AI)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Tham số chung
AI_TEMPERATURE=0.7
AI_TIMEOUT=120000
AI_MAX_RETRIES=2
```

### Bước 3: Nạp dữ liệu mẫu ban đầu
Chạy lệnh khởi tạo dữ liệu mẫu (sản phẩm, danh mục, tài khoản các nhóm phân quyền):
```bash
npm run seed
```
Lệnh này sẽ tự động khởi tạo các file dữ liệu trong `database/data/*.json`.

### Bước 4: Hướng dẫn khởi động dự án và chuyển đổi giữa 2 AI Provider

Hệ thống hỗ trợ chuyển đổi linh hoạt giữa **Google Gemini (Cloud AI)** và **Ollama (Local AI)** chỉ bằng cấu hình trong file `.env`, **tuyệt đối không cần sửa đổi bất kỳ dòng source code nào**.

```
+-------------------------------------------------------------------------+
|                    LỰA CHỌN AI PROVIDER TRONG .ENV                      |
|                                                                         |
|   AI_PROVIDER=gemini       ===>  Google Gemini Cloud REST API          |
|   (Mặc định - Khuyên dùng)       - Phản hồi cực nhanh, không tốn RAM    |
|                                  - Không cần cài đặt bất cứ thứ gì      |
|                                                                         |
|   AI_PROVIDER=ollama       ===>  Ollama Local Server (cổng 11434)       |
|   (Chạy Offline)                 - Bảo mật dữ liệu nội bộ               |
|                                  - Cần bật `ollama serve` trước         |
+-------------------------------------------------------------------------+
```

#### Cách 1: Sử dụng Google Gemini (Mặc định - Khuyên dùng)
- **Đặc điểm:** Chạy trên Cloud của Google, phản hồi nhanh, không cần cài đặt thêm phần mềm, không tốn RAM hay GPU máy tính.
- **Cách thiết lập trong `.env`:**
  ```env
  AI_PROVIDER=gemini
  GEMINI_API_KEY=AIzaSyCv3XnnYCHPofQ233x1JUxzqsCzqYfs-mw
  GEMINI_MODEL=gemini-3.1-flash-lite
  ```
- **Khởi động server:**
  ```bash
  npm run dev   # hoặc npm start
  ```
  Terminal sẽ thông báo:
  ```text
  [AI] Provider đã kích hoạt: GEMINI (Model: gemini-3.1-flash-lite)
  ```

---

#### Cách 2: Sử dụng Ollama (Chạy Offline cục bộ)
- **Đặc điểm:** Toàn bộ dữ liệu xử lý trực tiếp trên GPU/CPU của máy tính, thích hợp khi cần chạy offline hoặc kiểm thử mô hình nguồn mở.
- **Các bước thực hiện:**
  1. Khởi động Ollama trên máy (mở Terminal mới):
     ```bash
     ollama serve
     ```
  2. Sửa giá trị `AI_PROVIDER` trong file `.env`:
     ```env
      AI_PROVIDER=openai
      AI_BASE_URL=http://localhost:11434/v1
      AI_API_KEY=ollama
      AI_MODEL=qwen2.5:3b
     ```
  3. Khởi động lại Backend:
     ```bash
     npm run dev   # hoặc npm start
     ```
     Terminal sẽ thông báo:
     ```text
     [AI] Provider đã kích hoạt: OLLAMA (Model: llama3.2)
     ```

---

#### Công cụ kiểm tra nhanh kết nối AI (Diagnostic CLI)
Bạn có thể kiểm tra trạng thái kết nối và khả năng gọi Tool Calling của từng Provider trước khi chạy server:
- Kiểm tra kết nối **Gemini**:
  ```bash
  node scripts/test-ai.js --provider=gemini
  ```
- Kiểm tra kết nối **Ollama**:
  ```bash
  node scripts/test-ai.js --provider=ollama
  ```

---

#### Hướng dẫn dừng Web Server và AI khi không sử dụng
- **Dừng Web Server:** Nhấn `Ctrl + C` tại terminal đang chạy `npm start` hoặc `npm run dev`.
- **Dừng Ollama:** Nhấn `Ctrl + C` tại terminal chạy `ollama serve`, hoặc dùng PowerShell:
  ```powershell
  # Dừng Web App
  Stop-Process -Name node -Force -ErrorAction SilentlyContinue

  # Dừng Ollama AI
  Stop-Process -Name ollama -Force -ErrorAction SilentlyContinue
  ```

---

## 7. Tài khoản đăng nhập mẫu theo từng nhóm phân quyền

| Nhóm đối tượng | Vai trò (Role) | Email | Mật khẩu | Quyền hạn chính |
| :--- | :--- | :--- | :--- | :--- |
| **Quản trị viên** | `admin` | `admin@example.com` | `Admin@123456` | Toàn quyền hệ thống, quản lý nhân sự, cài đặt giờ làm việc, duyệt lịch hẹn |
| **Nhân viên lễ tân** | `receptionist` | `receptionist@example.com` | `Receptionist@123456` | Xem danh sách lịch hẹn, lọc/tìm kiếm lịch hẹn, xem thông tin khách; **không được sửa trạng thái/hủy lịch** và **không được vào trang quản trị Admin** |
| **Nhân viên tư vấn** | `staff` | `staff@example.com` | `Staff@123456` | Trực chat thời gian thực với khách hàng, tư vấn sản phẩm, duyệt/đổi lịch |
| **Khách hàng** | `user` | `user@example.com` | `User@123456` | Đặt lịch tự động điền thông tin cá nhân, xem lịch sử đặt lịch cá nhân (`/my-appointments`) |
| **Khách vãng lai** | `guest` | *(Không cần)* | *(Không cần)* | Xem sản phẩm, đặt lịch hẹn không cần đăng nhập (lưu theo session) |

---

## 8. Hướng dẫn sử dụng các chức năng chính

### 1. Đặt lịch tư vấn và quản lý lịch hẹn
- Mở chat từ website hoặc truy cập `http://localhost:3000/chat.html` để trò chuyện với Trợ lý AI và yêu cầu hỗ trợ đặt lịch.
- Đăng ký/đăng nhập tài khoản khách hàng từ mục **Đăng ký/Đăng nhập** trên thanh điều hướng.
- Đường dẫn `/appointments.html` cũ được chuyển đến giao diện chat; API đặt lịch vẫn được chatbot sử dụng.

### 2. Dành cho Nhân viên Lễ tân (Receptionist)
- Đăng nhập tại `http://localhost:3000/admin/login.html` với tài khoản `receptionist@example.com` / `Receptionist@123456`.
- Hệ thống tự động chuyển hướng và chỉ hiển thị menu **Lịch hẹn (Xem)**.
- Lễ tân có thể tra cứu theo ngày, giờ, trạng thái và xem chi tiết khách hàng.
- Nút duyệt/hủy/đổi lịch bị ẩn và API được bảo vệ nghiêm ngặt (chặn 403 Forbidden nếu cố tình chỉnh sửa).

### 3. Dành cho Quản trị viên (Admin)
- Đăng nhập với `admin@example.com` / `Admin@123456`.
- Truy cập toàn quyền: Báo cáo tổng quan, Quản lý sản phẩm, Duyệt/Đổi/Hủy lịch hẹn, Quản lý tài khoản nhân viên & lễ tân, Cài đặt giờ làm việc công ty.

---

## 9. Sao lưu & Phục hồi dữ liệu (Backup & Restore)

Hệ thống cung cấp script sao lưu toàn bộ thư mục `database/data/` thành file zip tiện lợi:

### Sao lưu dữ liệu:
- Trên Windows PowerShell:
  ```powershell
  npm run backup:db
  # Hoặc: powershell -File scripts/backup-db.ps1
  ```
- Trên Linux/Bash:
  ```bash
  ./scripts/backup-db.sh
  ```
Bản sao lưu sẽ được nén và lưu trong thư mục `backups/data_backup_[timestamp].zip`.

### Phục hồi dữ liệu:
- Trên Windows PowerShell:
  ```powershell
  powershell -File scripts/restore-db.ps1 -Force
  ```
- Trên Linux/Bash:
  ```bash
  ./scripts/restore-db.sh
  ```

---

## 10. Chạy kiểm thử tự động (Testing)

Hệ thống bao gồm bộ kiểm thử tự động toàn diện kiểm tra tất cả các tầng nghiệp vụ:
```bash
npm test
```
Bộ test bao gồm:
1. `appointments.test.js`: Kiểm thử kiểm tra khung giờ trống, đặt lịch, chống xung đột giờ (409 Conflict), tra cứu token.
2. `auth.test.js`: Kiểm thử đăng nhập, bảo mật JWT, kiểm tra tài khoản vô hiệu hóa.
3. `conversations.test.js`: Kiểm thử phiên khách vãng lai, chat AI, chuyển kênh sang nhân viên, bảo toàn tin nhắn.
4. `products.test.js`: Kiểm thử danh mục, sản phẩm, tìm kiếm, lọc và phân quyền.
5. `rbac_and_users.test.js`: Kiểm thử đăng ký khách hàng, liên kết lịch hẹn với `user_id`, phân quyền xem lịch của lễ tân và ngăn chặn lễ tân sửa đổi dữ liệu.

---

## 11. Hướng dẫn toàn diện: Dựng, Tải AI về Local & Huấn luyện (Train) AI cho Chatbox

Hệ thống được thiết kế theo kiến trúc mở, cho phép bạn chạy mô hình AI **hoàn toàn ngoại tuyến trên máy tính cục bộ (Local)** mà không phụ thuộc vào các dịch vụ trả phí, đồng thời hỗ trợ mở rộng tri thức và tích hợp widget box chat vào bất kỳ website nào.

---

### 11.1. Cách tải và chạy AI hoàn toàn trên máy cục bộ (Local AI)

Dự án sử dụng chuẩn kết nối **OpenAI-Compatible API**, vì vậy có thể kết nối hoàn hảo với **Ollama** – nền tảng chạy mô hình ngôn ngữ lớn (LLM) cục bộ phổ biến nhất hiện nay.

#### Bước 1: Tải và cài đặt Ollama
- **Windows / macOS:** Tải bộ cài đặt trực tiếp tại trang chủ [ollama.com/download](https://ollama.com/download) và tiến hành cài đặt theo hướng dẫn.
- **Linux:** Chạy lệnh cài đặt nhanh qua terminal:
  ```bash
  curl -fsSL https://ollama.com/install.sh | sh
  ```

Sau khi cài đặt xong, Ollama sẽ chạy ngầm dưới nền và cung cấp cổng API mặc định tại `http://localhost:11434`.

#### Bước 2: Tải mô hình AI (Pull Model)
Mở cửa sổ dòng lệnh (Terminal / PowerShell) và tải mô hình phù hợp với cấu hình phần cứng của bạn:

| Mô hình đề xuất | Lệnh tải | Dung lượng RAM khuyến nghị | Điểm mạnh |
| :--- | :--- | :--- | :--- |
| **Qwen 2.5 (3B / 7B)** | `ollama run qwen2.5:7b` *(hoặc `3b`)* | 8GB - 16GB RAM | Hiểu tiếng Việt cực tốt, hỗ trợ Tool Calling (gọi hàm đặt lịch) rất chuẩn xác. |
| **Llama 3.2 (3B)** | `ollama run llama3.2` | 6GB - 8GB RAM | Siêu nhẹ, tốc độ sinh từ nhanh, cấu hình mặc định trong source code. |
| **Mistral (7B)** | `ollama run mistral` | 8GB - 16GB RAM | Lập luận logic tốt, tư vấn sản phẩm mạch lạc. |
| **DeepSeek-R1 (Distill 7B / 8B)** | `ollama run deepseek-r1:7b` | 8GB - 16GB RAM | Khả năng suy luận đa bước chuyên sâu (Reasoning). |

> [!TIP]
> Đối với máy tính thông thường (RAM 8GB - 16GB, có hoặc không có GPU rời), khuyến nghị sử dụng **`qwen2.5:7b`** hoặc **`llama3.2`** để đạt hiệu năng và độ chính xác tư vấn tốt nhất.

#### Bước 3: Kiểm tra API Ollama đã sẵn sàng
Mở trình duyệt hoặc dùng lệnh curl để kiểm tra endpoint:
```bash
curl http://localhost:11434/api/tags
```
Nếu màn hình trả về danh sách JSON chứa tên mô hình vừa tải là Ollama đã sẵn sàng phục vụ.

#### Bước 4: Kết nối Chatbox với Local AI
Mở file `.env` tại thư mục gốc của dự án và cập nhật các dòng sau:
```ini
AI_PROVIDER=openai
AI_BASE_URL=http://localhost:11434/v1
AI_MODEL=qwen2.5:7b
AI_TEMPERATURE=0.6
```
*(Nếu dùng Llama 3.2, chỉ cần đặt `AI_MODEL=llama3.2`).*

---

### 11.2. Cách "Huấn luyện" (Train) & Tinh chỉnh tri thức AI cho Chatbox

Trong thực tế phát triển chatbot doanh nghiệp, nhiều người thường nhầm lẫn giữa **Pre-training (đào tạo từ đầu)**, **Fine-tuning (tinh chỉnh)**, và **RAG / Function Calling (truy xuất tri thức thực tế)**. 

Dưới đây là 4 cấp độ huấn luyện và tùy chỉnh AI từ đơn giản đến chuyên sâu:

```
[ Cấp độ 1: Prompt Engineering ] -> Điều chỉnh phong cách, quy tắc tư vấn (Không cần code thêm)
               ▼
[ Cấp độ 2: Ollama Modelfile   ] -> Đóng gói bản AI mang nhận diện riêng của thương hiệu
               ▼
[ Cấp độ 3: Tool / Function Call] -> RAG & kết nối Database: Tự tra giá, xem giờ trống, chốt lịch (Khuyên dùng)
               ▼
[ Cấp độ 4: Fine-Tuning chuyên sâu] -> Huấn luyện trọng số mô hình với tập dữ liệu lịch sử hội thoại
```

---

#### Cấp độ 1: Prompt Engineering & Thiết lập nhân vật (Persona)
Đây là cách nhanh nhất và hiệu quả nhất để định hình AI. Bạn có thể quy định rõ giọng điệu, danh mục sản phẩm chủ lực và các điều cấm kỵ.

Trong file [src/ai/orchestrator.js](file:///d:/projects/chatbox/src/ai/orchestrator.js), bạn có thể chỉnh sửa `SYSTEM_PROMPT`:
```javascript
const SYSTEM_PROMPT = `Bạn là Chuyên viên tư vấn bán hàng và Đặt lịch hẹn cao cấp của Công ty.
Nhiệm vụ của bạn:
1. Chào đón khách hàng niềm nở, xưng hô lịch sự, lễ phép (Dạ/Vâng).
2. Tư vấn sản phẩm chính xác dựa trên danh mục sản phẩm của công ty.
3. Khi khách có nhu cầu gặp chuyên gia hoặc trải nghiệm sản phẩm, chủ động gợi ý khách đặt lịch hẹn.
4. Khi khách muốn đặt lịch: Luôn sử dụng công cụ "check_available_slots" để xem giờ trống trước khi xác nhận.
5. Tuyệt đối không bịa đặt sản phẩm công ty không kinh doanh.
6. Khi khách yêu cầu gặp người thật, hướng dẫn khách nhấn nút "Gặp nhân viên hỗ trợ".`;
```

---

#### Cấp độ 2: Đóng gói mô hình riêng bằng Ollama `Modelfile`
Bạn có thể tạo ra một mô hình mang thương hiệu riêng của cửa hàng (ví dụ: `my-store-ai`) chạy trên máy local mà không cần can thiệp sâu vào code.

1. Tạo một file tên là `Modelfile` trong thư mục dự án với nội dung:
   ```dockerfile
   # Sử dụng mô hình nền tảng gốc
   FROM qwen2.5:7b

   # Cấu hình tính sáng tạo (0.0: rất kỷ luật/chính xác - 1.0: sáng tạo)
   PARAMETER temperature 0.6
   PARAMETER top_p 0.9

   # Nạp prompt chỉ dẫn hệ thống
   SYSTEM """
   Bạn là Trợ lý AI độc quyền của Cửa hàng Công Nghệ ABC.
   Bạn am hiểu sâu sắc về Laptop, Phụ kiện và quy trình bảo hành.
   Luôn trả lời ngắn gọn, súc tích, bằng tiếng Việt tự nhiên và hỗ trợ khách đặt lịch trải nghiệm máy.
   """
   ```

2. Chạy lệnh tạo mô hình tùy biến:
   ```bash
   ollama create my-store-ai -f ./Modelfile
   ```

3. Cập nhật file `.env`:
   ```ini
   AI_MODEL=my-store-ai
   ```

---

#### Cấp độ 3: Tích hợp tri thức động thông qua Tool Calling (Khuyến nghị cho Doanh nghiệp)
> [!IMPORTANT]
> **Tại sao không nên train cố định giá sản phẩm và lịch hẹn vào trọng số AI?**
> Vì giá bán, số lượng tồn kho và khung giờ làm việc thay đổi từng phút. Nếu đem đi train (fine-tune), AI sẽ bị ghi nhớ thông tin cũ và trả lời sai sự thật (hallucination).

Hệ thống này áp dụng kiến trúc **Agentic Tool Calling Loop** (đặt trong [src/ai/tools.js](file:///d:/projects/chatbox/src/ai/tools.js) và [src/ai/orchestrator.js](file:///d:/projects/chatbox/src/ai/orchestrator.js)):
- **AI không cần nhớ lịch hẹn:** Khi khách hỏi *"Ngày mai 9h sáng có rảnh không?"*, AI sẽ tự động kích hoạt function `check_available_slots({ date: "2026-10-30" })`.
- **Backend đọc dữ liệu trực tiếp:** Hệ thống đọc file `database/data/appointments.json` và trả lời còn trống hay đã bị đặt.
- **AI chốt đơn:** AI nhận kết quả từ backend rồi thông báo tự nhiên cho khách và gọi tool `create_appointment` để ghi dữ liệu vào database.

---

#### Cấp độ 4: Huấn luyện chuyên sâu (Fine-Tuning) bằng dữ liệu lịch sử hội thoại
Nếu bạn muốn mô hình học sâu ngữ điệu bán hàng đặc thù hoặc cách chốt sale độc quyền của doanh nghiệp:

1. **Thu thập dữ liệu thực tế:** Hệ thống tự động lưu toàn bộ câu hỏi của khách và câu trả lời của tư vấn viên trong `database/data/messages.json`.
2. **Xuất tập dữ liệu huấn luyện dạng JSONL:** Chuẩn bị file `dataset.jsonl` theo chuẩn OpenAI / ChatML:
   ```json
   {"messages": [{"role": "system", "content": "Bạn là chuyên viên tư vấn ABC..."}, {"role": "user", "content": "Bên mình có dòng máy nào làm đồ họa mượt dưới 20 triệu không?"}, {"role": "assistant", "content": "Dạ chào anh/chị, trong tầm giá dưới 20 triệu, em đề xuất 2 mẫu máy tối ưu card đồ họa chuyên dụng..."}]}
   ```
3. **Tiến hành Fine-tune với LoRA / QLoRA:**
   - Sử dụng thư viện mã nguồn mở như [Unsloth](https://github.com/unslothai/unsloth) trên Google Colab (miễn phí GPU T4) để nạp base model `qwen2.5:7b` hoặc `llama-3`.
   - Nạp file `dataset.jsonl` và thực hiện huấn luyện 3 - 5 epochs với LoRA adapter.
4. **Chuyển đổi sang định dạng GGUF và nạp vào Ollama:**
   - Xuất adapter đã train thành file `.gguf` (ví dụ `my-finetuned-model-q4_k_m.gguf`).
   - Tạo `Modelfile` với dòng đầu `FROM ./my-finetuned-model-q4_k_m.gguf` và chạy `ollama create my-finetuned-ai -f Modelfile`.

---

### 11.3. Cách dựng và tích hợp Box Chat vào Website

Quy trình tích hợp box chat gồm 3 tầng:

```
[ Frontend: Box Chat Widget ] 
       │  (1) Gửi tin nhắn qua WebSockets / REST API
       ▼
[ Backend: Express + Socket.IO + Orchestrator ]
       │  (2) Nạp lịch sử chat & công cụ nghiệp vụ (Tools)
       ▼
[ AI Engine: Ollama Local (http://localhost:11434/v1) ]
       │  (3) AI trả về kết quả tư vấn hoặc gọi tool kiểm tra lịch
       ▼
[ Backend: Thực thi Tool & Cập nhật Database ]
       │  (4) Phản hồi thời gian thực về màn hình khách hàng
       ▼
[ Khách hàng nhận câu trả lời / Lịch hẹn được tạo thành công ]
```

#### Kiến trúc xử lý luồng tin nhắn phía Backend:
1. **Lắng nghe sự kiện:** Khi khách gõ tin nhắn, Client phát sự kiện `customer_message` qua Socket.IO tới [src/chat/socketHandler.js](file:///d:/projects/chatbox/src/chat/socketHandler.js).
2. **Kiểm tra trạng thái phiên:** Nếu cuộc hội thoại đang ở chế độ `ai`, server chuyển tin nhắn sang [src/ai/orchestrator.js](file:///d:/projects/chatbox/src/ai/orchestrator.js).
3. **Agentic Tool Execution:** AI phân tích câu hỏi. Nếu cần tra cứu dữ liệu hoặc đặt lịch, AI trả về yêu cầu gọi Tool. Server tự động thực thi hàm trong [src/ai/tools.js](file:///d:/projects/chatbox/src/ai/tools.js) và gửi lại kết quả cho AI sinh câu trả lời hoàn chỉnh.
4. **Human Handoff (Chuyển giao nhân viên):** Khi khách bấm nút *"Gặp nhân viên"* hoặc AI nhận diện khách không hài lòng, trạng thái phòng chat chuyển sang `queued` / `human`. Lúc này AI sẽ ngừng trả lời và thông báo đẩy tới bảng điều khiển của nhân viên trực (`/admin/chat.html`).

---

### 11.4. Hướng dẫn nhúng Box Chat vào bất kỳ trang web nào (Code mẫu)

Bạn có thể nhúng widget chat vào bất kỳ trang HTML, WordPress, Landing page hay ứng dụng React/Vue nào với đoạn mã sau:

#### 1. Nhúng thư viện Socket.IO Client
Đặt thẻ script trước thẻ đóng `</body>`:
```html
<script src="/socket.io/socket.io.js"></script>
<!-- Hoặc qua CDN: <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script> -->
```

#### 2. Thêm nút Box Chat nổi và cửa sổ hội thoại (HTML & CSS)
```html
<!-- Nút mở Chatbox nổi ở góc phải màn hình -->
<button id="chat-toggle-btn" style="position:fixed;bottom:20px;right:20px;z-index:9999;padding:12px 20px;background:#2563eb;color:#fff;border:none;border-radius:50px;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;font-weight:bold;">
  💬 Chat với AI tư vấn
</button>

<!-- Khung cửa sổ Chatbox -->
<div id="chat-widget" style="display:none;position:fixed;bottom:80px;right:20px;width:360px;height:520px;background:#fff;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.2);flex-direction:column;z-index:9999;overflow:hidden;border:1px solid #e5e7eb;">
  <!-- Header -->
  <div style="background:#2563eb;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-weight:bold;">Trợ lý AI Tư vấn & Đặt lịch</span>
    <button id="chat-close-btn" style="background:transparent;border:none;color:#fff;font-size:16px;cursor:pointer;">✕</button>
  </div>

  <!-- Vùng hiển thị tin nhắn -->
  <div id="chat-messages" style="flex:1;padding:12px;overflow-y:auto;background:#f9fafb;display:flex;flex-direction:column;gap:8px;font-size:14px;">
    <div style="background:#e5e7eb;padding:8px 12px;border-radius:8px;max-width:85%;align-self:flex-start;">
      Xin chào! Em là trợ lý AI. Em có thể giúp gì cho anh/chị về sản phẩm hoặc đặt lịch tư vấn ạ?
    </div>
  </div>

  <!-- Vùng nhập liệu -->
  <form id="chat-form" style="display:flex;border-top:1px solid #e5e7eb;padding:8px;background:#fff;">
    <input type="text" id="chat-input" placeholder="Nhập tin nhắn..." autocomplete="off" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:8px 12px;outline:none;" required />
    <button type="submit" style="margin-left:8px;background:#2563eb;color:#fff;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;">Gửi</button>
  </form>
</div>
```

#### 3. Khởi tạo kết nối và xử lý luồng chat (JavaScript)
```javascript
const socket = io('http://localhost:3000'); // Trỏ tới domain server backend của bạn
let currentConversationId = null;

// Khởi tạo phiên trò chuyện (Guest Session)
async function initChatSession() {
  const res = await fetch('http://localhost:3000/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'web' })
  });
  const data = await res.json();
  currentConversationId = data.conversation.id;

  // Gia nhập phòng socket của hội thoại
  socket.emit('join_conversation', { conversation_id: currentConversationId });
}

// Mở/Đóng cửa sổ Chatbox
const toggleBtn = document.getElementById('chat-toggle-btn');
const chatWidget = document.getElementById('chat-widget');
const closeBtn = document.getElementById('chat-close-btn');

toggleBtn.addEventListener('click', () => {
  const isHidden = chatWidget.style.display === 'none';
  chatWidget.style.display = isHidden ? 'flex' : 'none';
  if (isHidden && !currentConversationId) {
    initChatSession();
  }
});
closeBtn.addEventListener('click', () => {
  chatWidget.style.display = 'none';
});

// Lắng nghe tin nhắn trả lời từ AI
socket.on('ai_message', (msg) => {
  renderMessage(msg.content, 'assistant');
});

// Lắng nghe tin nhắn từ nhân viên hỗ trợ khi chuyển kênh
socket.on('new_message', (msg) => {
  if (msg.sender_type !== 'guest' && msg.sender_type !== 'user') {
    renderMessage(msg.content, 'staff');
  }
});

// Xử lý gửi tin nhắn từ khách hàng
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const messagesContainer = document.getElementById('chat-messages');

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !currentConversationId) return;

  // Hiển thị tin nhắn của khách lên màn hình
  renderMessage(text, 'user');
  chatInput.value = '';

  // Gửi sự kiện lên server để AI xử lý
  socket.emit('customer_message', {
    conversation_id: currentConversationId,
    content: text
  });
});

function renderMessage(content, sender) {
  const div = document.createElement('div');
  div.style.padding = '8px 12px';
  div.style.borderRadius = '8px';
  div.style.maxWidth = '85%';
  div.style.wordBreak = 'break-word';

  if (sender === 'user') {
    div.style.background = '#2563eb';
    div.style.color = '#fff';
    div.style.alignSelf = 'flex-end';
  } else {
    div.style.background = '#e5e7eb';
    div.style.color = '#1f2937';
    div.style.alignSelf = 'flex-start';
  }

  div.textContent = content;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
```

---

### 11.5. Tổng kết quy trình triển khai thực tế

1. **Chạy Local AI:** Cài đặt Ollama -> Lệnh `ollama run qwen2.5:7b` -> Cấu hình `.env` trỏ vào `http://localhost:11434/v1`.
2. **Cập nhật tri thức:** Tinh chỉnh quy tắc trong [src/ai/orchestrator.js](file:///d:/projects/chatbox/src/ai/orchestrator.js), bổ sung sản phẩm trong `database/data/products.json`.
3. **Khởi động hệ thống:** `npm run dev` hoặc `npm start`.
4. **Nhúng Widget vào website:** Đưa đoạn mã HTML/JS ở mục 11.4 vào các trang cần hỗ trợ để khách hàng tương tác trực tiếp với AI.
