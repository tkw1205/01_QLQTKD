# Comprehensive Codebase & Architecture Analysis Report
**Target Project:** Mây Hair Studio (Salon Booking & AI Chatbox Platform)  
**Author:** explorer_survey_1_gen2  
**Date:** 2026-10-30  
**Status:** Complete Read-Only Investigation  

---

## 1. Executive Summary

This investigation surveys the architecture, backend logic, data persistence layer, AI integration, and frontend user experience for the salon appointment booking and AI chat platform.

### Key Discoveries:
1. **Holding Slot TTL (R2 / CR-03):** Currently hardcoded to 10 minutes (`HOLD_DURATION_MS = 10 * 60 * 1000`) in `src/repositories/appointmentRepository.js:7`, with textual references in `routes/appointments.js:49`, `ai/tools.js:39,436`, and `ai/orchestrator.js:166-173,393`. Expiration cleanup is lazy (executed on queries), with no background daemon.
2. **Chat Session Lifecycle & Idle Timeout (R3 / CR-04, CR-05, CR-06):** No idle timeout tracking exists in `src/chat/socketHandler.js`, `src/routes/conversations.js`, or `src/services/conversationService.js`. When a session is closed (`mode === 'closed'`), customer messages trigger HTTP 400 errors instead of auto-spawning a new conversation and preserving history as read-only.
3. **Email Optionality (R1 / CR-01):** The web booking form and backend service layer (`src/services/appointmentService.js:112,157`) already treat email as optional/nullable. However, the AI dialogue engine strictly blocks booking without email in `src/ai/tools.js:59,80,493-509,626-631` and `src/ai/orchestrator.js:143,177-184`.
4. **Appointment Lookup (CR-01):** System only allows UUID token lookup (`/api/appointments/lookup/:token`), which strictly requires the request's `guest_session_id` to match. Customers cannot look up appointments using `Phone Number + Booking Code` (`BK-YYYYMMDD-XXXX`), and the web UI has no inputs for phone + booking code.
5. **Mock JSON Database Stability (database/data/):** `src/config/jsonStore.js` uses `fs.renameSync` on Windows without retry or cleanup, causing orphaned `.tmp.*` files (dozens currently present), file lock failures on concurrent writes, and possible data divergence.
6. **Frontend UX & Showcase Readiness:** The booking interface (`public/appointments.html`) and chat page (`public/chat.html`) have leftover mock tech-store strings ("Chatbox Store", "giải pháp cấu hình máy cho doanh nghiệp", "Sản phẩm cần tư vấn"), UUID token lookup hurdles, and unhandled closed-session UI states.

---

## 2. Detailed Findings by Area

---

### Area 1: Backend Architecture & Directory Map

The backend is built with Node.js and Express 4.21.2, using HTTP + Socket.IO 4.8.1 for real-time customer and staff chat.

```
src/
├── app.js                         # Application entrypoint, middleware, route mounting, Socket.IO binding
├── ai/
│   ├── AIService.js               # AI provider wrapper (Gemini & Ollama)
│   ├── orchestrator.js           # Multi-turn prompt construction, intent & date detection, guardrails
│   ├── provider.js                # Singleton instance of AIService
│   ├── tools.js                   # OpenAI function calling tool definitions and executions
│   └── providers/
│       ├── BaseProvider.js
│       ├── GeminiProvider.js
│       └── OllamaProvider.js
├── chat/
│   └── socketHandler.js          # Socket.IO connection, room management ('conv_<id>', 'agents'), event routing
├── config/
│   ├── database.js               # SQL-like query interface mock
│   ├── index.js                  # Environment configuration
│   ├── jsonStore.js              # Mock JSON persistence layer with in-memory caching
│   └── jwt.js                    # JWT token sign/verify
├── middleware/
│   ├── auth.js                   # JWT authentication & role-based access control (admin, staff, receptionist, user)
│   ├── errorHandler.js           # Global error handler and 404 middleware
│   ├── guestSession.js           # Cookie/Header-based guest session UUID injector (req.guestSessionId)
│   └── validate.js               # Schema validator middleware
├── repositories/
│   ├── appointmentRepository.js  # Slot calculation, holding slots, booking code generation, CRUD
│   ├── conversationRepository.js # Conversation sessions, mode management, unread counts
│   ├── messageRepository.js      # Message storage, deduplication
│   ├── notificationRepository.js # Staff notifications for new chat requests
│   ├── productRepository.js      # Salon services querying
│   ├── settingsRepository.js     # System & business working hours settings
│   └── userRepository.js         # User accounts and credentials
├── routes/
│   ├── admin.js                  # Staff/Admin user management
│   ├── appointments.js           # Public and staff appointment endpoints
│   ├── auth.js                   # Login, register, profile
│   ├── conversations.js          # Guest and agent conversation HTTP routes
│   ├── notifications.js          # Staff notification read/list
│   ├── products.js               # Public product/service catalog
│   └── settings.js               # Public and admin settings
└── services/
    ├── appointmentService.js     # Booking business logic, validation, holding slot coordination
    ├── authService.js            # User authentication logic
    └── conversationService.js    # Mode switching (AI <-> Human), agent claim, close as lead
```

---

### Area 2: Holding Slot Logic & 10-Minute to 5-Minute Transition

#### 2.1 Current Implementation Trace
1. **Repository Definition (`src/repositories/appointmentRepository.js`):**
   - **Line 7:** `const HOLD_DURATION_MS = 10 * 60 * 1000; // 10 minutes TTL`
   - **Line 32-40 (`isSlotOccupiedByAppt`):** Evaluates if a slot is blocked:
     ```javascript
     function isSlotOccupiedByAppt(appt, now = Date.now()) {
       if (appt.status === 'cancelled') return false;
       if (appt.status === 'holding') {
         if (appt.hold_expires_at && new Date(appt.hold_expires_at).getTime() <= now) {
           return false; // Holding expired, slot is free
         }
       }
       return true;
     }
     ```
   - **Line 42-62 (`cleanupExpiredHolds`):** Scans all appointments. If `status === 'holding'` and `hold_expires_at <= now`, sets `status = 'cancelled'` and appends `'Holding slot expired (TTL 10m)'` to `notes`.
   - **Line 144 (`hold`):** Computes expiration: `const expiresAt = new Date(now + HOLD_DURATION_MS).toISOString();`.
   - **Line 213-230 (`confirmHold`):** Validates expiration. If expired, marks appointment cancelled and returns HTTP 410 with message `'Holding period of 10 minutes has expired. Please select a time slot again.'`.
2. **API Route (`src/routes/appointments.js`):**
   - **Line 24:** `// POST /api/appointments/hold - Step 6: Temporary Hold Slot (TTL 10 mins)`
   - **Line 49:** Response message: `message: 'Khung giờ đã được giữ chỗ tạm thời trong 10 phút.'`
3. **AI Tools (`src/ai/tools.js`):**
   - **Line 39:** Description mentions `TTL 10m`.
   - **Line 436:** Prompt tool execution message: `'ĐÃ GIỮ CHỖ THÀNH CÔNG khung giờ ... trong 10 phút.'`.
4. **AI Orchestrator (`src/ai/orchestrator.js`):**
   - **Lines 166, 169, 172, 173, 393:** Prompt instructions and regex safety checks mandate the 10-minute wording.

#### 2.2 Transition Plan to 5 Minutes (R2 / CR-02 / CR-03)
To change holding slots to 5 minutes cleanly and safely:
- Modify `HOLD_DURATION_MS` in `appointmentRepository.js:7` to `5 * 60 * 1000`.
- Update expiration note in `appointmentRepository.js:51` to `(TTL 5m)`.
- Update error message in `appointmentRepository.js:222` to `'Holding period of 5 minutes has expired. Please select a time slot again.'`.
- Update API success response in `routes/appointments.js:49` to `'Khung giờ đã được giữ chỗ tạm thời trong 5 phút.'`.
- Update tool definitions & execution responses in `src/ai/tools.js` lines 39 and 436.
- Update AI prompts and guardrails in `src/ai/orchestrator.js` lines 166, 169, 172, 173, 393.
- Unify wait time for "Chờ chọn giờ" and holding slots to 5 minutes across automated messages (per `docs/spec/Câu-trả-lời.docx`).

---

### Area 3: Chat Session Lifecycle & Timeout Architecture

#### 3.1 Current Gap
The codebase has no active timeout scheduler. A conversation created with `mode: 'ai'` or claimed by staff (`mode: 'human'`) remains indefinitely in that state unless an agent manually calls `POST /api/conversations/agent/:id/close`.

Furthermore, when a conversation is closed:
- In `src/routes/conversations.js:41`: `POST /api/conversations/:id/chat` returns:
  `400 { success: false, error: 'Conversation is not in AI mode' }`
- In `src/routes/conversations.js:125`: `POST /api/conversations/:id/message` returns:
  `400 { success: false, error: 'Conversation is closed' }`
- In `src/chat/socketHandler.js:142`: `socket.emit('error', { message: 'Conversation not available' })`
- In `public/js/chat.js:464`: Front-end displays toast `'Lỗi gửi tin nhắn'` and halts.

#### 3.2 Required Specification (R3 / CR-04, CR-05, CR-06)
1. **AI Mode Inactivity Timeout (2 Stages - Total 10 Minutes):**
   - **Stage 1 (After 5 minutes of silence since last customer message):**
     System automatically posts an automated warning message into the conversation (via system or assistant sender) and emits it over Socket.IO:
     - After greeting: *"Bạn cần mình tư vấn dịch vụ nào ạ? Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."*
     - After advice: *"Bạn muốn đặt lịch hay cần hỏi thêm gì không ạ? Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."*
     - During slot hold: *"Giờ [X] đang giữ cho bạn, còn [N] phút. Bạn gửi họ tên, số điện thoại và xác nhận để chốt lịch nhé. Nếu không phản hồi, phiên chat kết thúc và giờ giữ sẽ được nhả ra."*
     - During slot selection: *"Bạn chọn giúp mình một khung giờ trống nhé. Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."*
     - General fallback: *"Bạn còn ở đó không ạ? Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."*
     - Conversation records a state flag: `timeout_warning_sent_at` or `status: 'warning'`.
   - **Stage 2 (After additional 5 minutes without customer message - total 10 minutes):**
     System automatically closes the session:
     - Updates `mode = 'closed'`.
     - Appends system message: *"Phiên chat đã kết thúc do không có phản hồi."*.
     - Emits `conversation_closed` event to `conv_<id>` and `agents` rooms.
2. **Staff Handover Mode Extension (60 Minutes - CR-06):**
   - When a conversation transitions to `mode: 'human'` (staff takes over), the idle timeout increases from 10 minutes to **60 minutes**.
   - If neither staff nor customer sends a message for 60 minutes, the session automatically transitions to `closed`.
3. **Customer Interaction Reset:**
   - Any incoming message from the customer clears the warning state, resets the inactivity timer, and keeps the conversation in `mode: 'ai'` or `'human'`.
4. **Returning User Handling (CR-05):**
   - When a returning customer sends a message to an already `closed` conversation:
     - The old conversation remains in `database/data/conversations.json` as read-only history.
     - Backend automatically instantiates a new conversation for the `guest_session_id`.
     - System associates the new message with the new conversation, triggers the AI greeting and response, and broadcasts to the new room.
     - Front-end updates its internal `this.conversation`, rejoins the new socket room, and displays the greeting without disruption.

#### 3.3 Proposed Architecture for Session Timeout
Create a dedicated `sessionTimeoutService.js` (or scheduler in `src/chat/timeoutManager.js`) invoked periodically (e.g. `setInterval` every 30 seconds in `src/app.js`):
- Checks all active conversations (`mode: 'ai'`, `'waiting_for_agent'`, `'human'`).
- Inspects the timestamp of the last message (`last_message_at` or `updated_at`).
- Evaluates elapsed time against 5 min (warning threshold) and 10 min / 60 min (close threshold).
- Sends warning message or executes close, triggering Socket.IO broadcasts.

---

### Area 4: Email Optionality Trace Across Codebase

| Location | File & Line | Current Behavior | Required Modification |
| :--- | :--- | :--- | :--- |
| **Web Form HTML** | `public/appointments.html:148` | `<label class="form-label" for="book-email">Địa chỉ Email</label>` | Add `<span class="text-muted">(Không bắt buộc)</span>` to label. |
| **Web Form JS** | `public/appointments.html:460,478` | `const email = document.getElementById('book-email').value.trim(); customerEmail: email \|\| null` | Already passes `null` if empty. ✅ |
| **Appointment Service** | `src/services/appointmentService.js:112,157` | `if (customerEmail && !isValidEmail(customerEmail))` | Already accepts null/empty, validates format only if provided. ✅ |
| **Appointment Repo** | `src/repositories/appointmentRepository.js:254,299` | `appt.customer_email = customerEmail \|\| null;` | Already supports `null`. ✅ |
| **AI Tool Schema** | `src/ai/tools.js:59` (`confirm_appointment`) | `required: ['customer_name', 'customer_phone', 'customer_email']` | Remove `'customer_email'` from `required` array. |
| **AI Tool Schema** | `src/ai/tools.js:80` (`create_appointment`) | `required: ['customer_name', 'customer_phone', 'customer_email', ...]` | Remove `'customer_email'` from `required` array. |
| **AI Tool Execution** | `src/ai/tools.js:493-509` (`confirm_appointment`) | `if (!rawEmail) return JSON.stringify({ error: 'MISSING_EMAIL' ... })` | Remove blocking check; allow `rawEmail` to be empty/null. Validate only if present. |
| **AI Tool Execution** | `src/ai/tools.js:626-631` (`create_appointment`) | `if (!rawEmail) return JSON.stringify({ error: 'MISSING_EMAIL' ... })` | Remove blocking check; allow `rawEmail` to be empty/null. Validate only if present. |
| **AI Prompt Instructions**| `src/ai/orchestrator.js:143` | `Hãy thu thập đủ Tên, SĐT và Email của khách...` | Update prompt: Email is optional. |
| **AI Prompt Instructions**| `src/ai/orchestrator.js:177-184` | `Khách hàng BẮT BUỘC phải cung cấp đủ 3 thông tin... Email hợp lệ (BẮT BUỘC)... KHÔNG tạo khi chưa có đủ Email!` | Remove mandatory email rule. Explicitly state: SĐT + Họ tên là bắt buộc; Email là tùy chọn (optional). |
| **Mock Database** | `database/data/appointments.json` | Stores `customer_email: null` or string | Schema already nullable. ✅ |

---

### Area 5: Appointment Lookup Logic & Phone + Booking Code

#### 5.1 Current Logic
- Endpoint `GET /api/appointments/lookup/:token` (`src/routes/appointments.js:178`) delegates to `appointmentService.getAppointmentByToken`.
- `appointmentService.getAppointmentByToken`:
  ```javascript
  let appt = await appointmentRepo.findByToken(confirmationToken);
  if (!appt) appt = await appointmentRepo.findByHoldingToken(confirmationToken);
  if (!appt) throw Object.assign(new Error('Appointment not found'), { status: 404 });

  const isGuestOwner = appt.guest_session_id === guestSessionId;
  const isUserOwner = currentUser && appt.user_id && appt.user_id === currentUser.id;
  const isStaff = currentUser && ['admin', 'staff', 'receptionist'].includes(currentUser.role);

  if (!isGuestOwner && !isUserOwner && !isStaff) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  ```
- Limitations:
  1. Only searches by UUID token (`confirmation_token` / `holding_token`).
  2. If a customer visits the website on a new device or cleared cookies, `guest_session_id` differs, resulting in `403 Access denied`.
  3. No support for `booking_code` (`BK-YYYYMMDD-XXXX`) combined with `customer_phone`.
  4. AI tool `get_appointment_details` (`src/ai/tools.js:680`) also checks only `confirmation_token` and enforces `appt.guest_session_id === guestSessionId`.
  5. UI in `public/appointments.html:186-196` only displays an input for "Mã xác nhận (UUID)".

#### 5.2 Required Implementation for CR-01
1. **Repository Method (`appointmentRepository.js`):**
   Add `findByBookingCodeAndPhone(bookingCode, phone)`:
   - Normalize `bookingCode` (trim, uppercase).
   - Normalize `phone` using `cleanPhoneNumber`.
   - Match records where `a.booking_code === cleanCode && cleanPhoneNumber(a.customer_phone) === cleanPhone`.
2. **Service Method (`appointmentService.js`):**
   Add `lookupAppointment({ bookingCode, phone, token, guestSessionId, currentUser })`:
   - If `bookingCode` and `phone` are provided: return appointment details if matched. (Phone + Booking Code proves ownership without requiring guest session cookies).
   - If `token` is provided: fall back to token-based lookup.
3. **Route Enhancements (`routes/appointments.js`):**
   - Add `GET /api/appointments/lookup` accepting `?bookingCode=...&phone=...`.
   - Enhance `GET /api/appointments/lookup/:token` so if `:token` matches format `BK-` or query contains `phone`, it delegates to Phone + Booking Code verification.
4. **AI Tooling (`src/ai/tools.js` & `src/ai/orchestrator.js`):**
   - Update `get_appointment_details` tool to accept parameters `booking_code` and `customer_phone`.
   - Instruct AI to ask for SĐT + Mã đặt lịch khi customer asks to look up an appointment.
5. **Web UI (`public/appointments.html`):**
   - Replace UUID-only input with two inputs:
     - `Số điện thoại` (`id="lookup-phone"`)
     - `Mã đặt lịch` (`id="lookup-code"`, placeholder: `BK-20261030-XXXX`)
   - Add lookup button calling the new endpoint and rendering the appointment card.

---

### Area 6: Mock JSON Database Layer Stability & Concurrency Analysis

#### 6.1 Vulnerability Analysis of `src/config/jsonStore.js`
In `jsonStore.js`, saving data to disk is handled by `saveCollection`:
```javascript
function saveCollection(collection, data) {
  ensureDataDir();
  cache[collection] = data;
  const filePath = getFilePath(collection);
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(tempPath, serialized, 'utf8');
  fs.renameSync(tempPath, filePath);
}
```

This presents several critical issues on Windows environments:
1. **Windows `fs.renameSync` EPERM/EBUSY Collisions:**
   On Windows NTFS, `renameSync` cannot overwrite a file if it is currently open by another read/write stream or antivirus/indexer handle. When this fails, Node throws `EPERM: operation not permitted` or `EBUSY: resource busy or locked`.
2. **Orphaned `.tmp.*` File Leaks:**
   When `fs.renameSync` fails, the temporary file `${filePath}.tmp.${Date.now()}` is never deleted. The filesystem already contains 26 orphaned `.tmp.*` files in `database/data/` (e.g., `appointments.json.tmp.1793206124454`, `messages.json.tmp.1793342546075`).
3. **Cache / Disk Inconsistency:**
   Notice `cache[collection] = data;` runs *before* the file write succeeds. If `fs.writeFileSync` or `fs.renameSync` fails, memory holds the updated data while disk holds the old data.
4. **No Serialization / Write Queue:**
   Concurrent asynchronous requests (e.g. concurrent slot bookings or incoming messages) trigger parallel calls to `saveCollection` for the same file, leading to race conditions where one write overwrites another or crashes with file lock errors.
5. **Data Loss on Read Corruption:**
   In `loadCollection(collection)`:
   ```javascript
   } catch (err) {
     console.error(`[MockDB] Error reading collection "${collection}":`, err.message);
     const defaults = DEFAULT_MAP[collection] !== undefined ? DEFAULT_MAP[collection] : [];
     cache[collection] = JSON.parse(JSON.stringify(defaults));
     return cache[collection];
   }
   ```
   If a file is temporarily unreadable or partially written when the server restarts, `loadCollection` discards all user data and resets the collection to default dummy data!

#### 6.2 Recommended Hardening Measures
1. **In-Memory Per-Collection Write Queue (Mutex):**
   Queue write operations per collection so disk writes are strictly serialized.
2. **Windows Retry Backoff for `renameSync`:**
   Wrap rename in a retry loop (3-5 attempts with 20-50ms jittered backoff) to handle transient Windows file locks.
3. **Guaranteed Temp Cleanup:**
   Execute `fs.unlinkSync(tempPath)` inside a `catch` block if rename fails.
4. **Atomic Backup File (`.bak`):**
   Before overwriting, preserve `collection.json.bak`. If `loadCollection` encounters invalid JSON, attempt restoring from `.bak` before resetting to empty defaults.
5. **Startup Orphan Cleanup:**
   In `initAll()`, scan `database/data/` and remove any leftover `.tmp.*` files older than 1 minute.

---

### Area 7: Frontend UX Review & Demo Readiness

#### 7.1 Identified Discrepancies & Gaps
1. **Residual Tech-Store Branding in Salon Webpage:**
   - In `public/appointments.html:6`: Title is `<title>Đặt Lịch & Quản Lý Lịch Hẹn - Chatbox Store</title>`.
   - In `public/appointments.html:154,156`: Form field is labeled `"Sản phẩm cần tư vấn"` with option `"Tư vấn chung toàn bộ sản phẩm"`. For salon services, this should be `"Dịch vụ làm tóc"` and `"Tư vấn toàn bộ dịch vụ"`.
   - In `public/appointments.html:175`: Notes textarea has placeholder:
     `placeholder="Ví dụ: Cần tư vấn giải pháp cấu hình máy cho doanh nghiệp..."`. This must be changed to salon styling requests (e.g. `"Ví dụ: Cắt tóc layer phom Hàn Quốc, nhuộm nâu lạnh..."`).
   - In `public/chat.html:6,25`: Title and header say `"Chatbox Store"`.
2. **Web Booking Form Email Field:**
   - `public/appointments.html:148` lacks `(Không bắt buộc)` note next to `Địa chỉ Email`, which can confuse users who assume it is required.
3. **Lookup UI Usability:**
   - Customers currently face a single input asking for a 36-character UUID token. Providing fields for `Số điện thoại` and `Mã đặt lịch` (e.g. `BK-20261030-XXXX`) will make demoing seamless.
4. **Chat Widget Status Display:**
   - When a session times out to `closed`, the chat input should guide the user that the session has ended and provide a clear one-click button or auto-reset to start a new consultation.
5. **Holding Slot Expiration Visibility:**
   - In the booking flow, once a slot is held, displaying an active 5-minute countdown indicator provides positive feedback on the TTL mechanism for showcase presentations.

---

## 3. Implementation Recommendations & Worker Division Strategy

Based on this analysis, implementation can be partitioned cleanly across 4 workers matching R1-R4:

| Worker Role | Focus Domain | Key Files Owned |
| :--- | :--- | :--- |
| **Worker 1 (R1 & Lookup)** | Email Optionality & Appointment Lookup | `src/routes/appointments.js`, `src/services/appointmentService.js`, `src/repositories/appointmentRepository.js`, `public/appointments.html` |
| **Worker 2 (R2 & DB Safety)** | Holding Slot 5m TTL & Mock DB Hardening | `src/repositories/appointmentRepository.js`, `src/config/jsonStore.js`, `src/routes/appointments.js` |
| **Worker 3 (R3 & AI Chat)** | Session Timeout Lifecycle & AI Dialogue Updates | `src/chat/socketHandler.js`, `src/routes/conversations.js`, `src/services/conversationService.js`, `src/services/sessionTimeoutService.js` (new), `src/ai/tools.js`, `src/ai/orchestrator.js`, `public/js/chat.js` |
| **Worker 4 (R4 & Tests)** | Test Suite Expansion & Regression Verification | `tests/` directory (adding test coverage for R1, R2, R3, CR-01 to CR-06) |

---
*Report prepared and compiled by explorer_survey_1_gen2.*
