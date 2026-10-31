# SPECIFICATION INVENTORY: SALON BOOKING & AI CHATBOX PLATFORM

- **Project**: Mây Hair Studio / Salon Lumière Booking & AI Chat Platform (`chatbox-consulting-platform`)
- **Author**: `spec_miner_survey_1_gen2`
- **Working Directory**: `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_1_gen2`
- **Sources of Truth**:
  1. `docs/spec/business_spec_booking.md` (Business Specification - AC-01 to AC-20)
  2. `docs/spec/phieu_lam_ro_change_request.md` (Clarification on Change Requests)
  3. `docs/spec/Câu-trả-lời.docx` (Authoritative PO/Stakeholder Approval & Answers)
  4. `docs/spec/Thay_doi_-_bo_sung.docx` (Original Change Request & Supplement Spec)
  5. `docs/spec/N1.QLQTKD.md` (Salon Lumière Functional Spec, RBAC & 78-service Catalog)
  6. `docs/prepared/booking_process_analysis.md`, `system_gap_analysis.md`, `n1_qlqtkd_analysis.md`
  7. Current Production Codebase: `src/` (Express API, JsonStore, Socket.IO, AI Orchestrator)

---

## Executive Summary of Change Requests (CR-01 to CR-06)

| CR ID | Scope | AS-IS Baseline | TO-BE Target Specification | Authoritative Approval Source |
|:---|:---|:---|:---|:---|
| **CR-01** | **Optional Email & Phone Lookup** | Email is strictly mandatory across web booking form, chat form, API validation, and AI prompt. Appointment lookup only uses UUID confirmation token. | Email is **Optional (Không bắt buộc)** on web and chat forms. API and DB accept `null`/omitted email. Customer lookup prioritizes **Phone number + Booking Code (`BK-YYYYMMDD-XXXX`)**. | `Câu-trả-lời.docx` Q1 (Option A); `phieu_lam_ro_change_request.md` Issue 1 |
| **CR-02** | **Unified 5-Minute Slot Selection Wait** | Conflict in spec: 3-minute wait trigger vs 5-minute reminder text. | Unified to **5 minutes** for both wait time condition and reminder message: *"Bạn chọn giúp mình một khung giờ trống nhé. Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."* | `Câu-trả-lời.docx` Q2 (Option B); `Thay_doi_-_bo_sung.docx` Section 3 |
| **CR-03** | **Holding Slot TTL 5 Minutes** | Temporary holding slot TTL is 10 minutes (`HOLD_DURATION_MS = 10 * 60 * 1000`). | Holding slot TTL changed to **5 minutes** (`HOLD_DURATION_MS = 5 * 60 * 1000`). Automatic release of unconfirmed slot after 5 minutes into the pool. | `Câu-trả-lời.docx` Q4 (Option B); `Thay_doi_-_bo_sung.docx` Section 3; `appointmentRepository.js` |
| **CR-04** | **AI Session 2-Stage Timeout (10m Total)** | No automatic chat session closure due to customer silence. Sessions remain open indefinitely. | **2-Stage Inactivity Timeout (Total 10 mins)**: After 5 mins of silence -> Send automated warning reminder. After an additional 5 mins of silence (total 10 mins) -> Automatically transition session to `CLOSED` status. | `Câu-trả-lời.docx` Q3 (Option B); `Thay_doi_-_bo_sung.docx` Section 2 & 3 |
| **CR-05** | **Closed Session Re-engagement** | Messaging a closed conversation throws error (`Conversation is closed`). | When customer messages a `CLOSED` session: old session transitions to **read-only** (history preserved), system **automatically creates a new session**, and AI **greets from the start**. | `Câu-trả-lời.docx` Q5 (Option A); `phieu_lam_ro_change_request.md` Issue 5 |
| **CR-06** | **Human Staff Handover 60m Timeout** | When transferred to staff, session was either unmanaged or subject to AI timeout. | Handover to human staff extends the inactivity timeout to **60 minutes** before auto-closing (gives staff sufficient buffer to respond). | `Câu-trả-lời.docx` Q6 (Option B); `phieu_lam_ro_change_request.md` Issue 6 |

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | CR-01: Booking Form | Optional Email on Web Form | Web booking form has Email field marked as optional without required asterisk; user can submit without entering email. | `customerName` (string, req), `customerPhone` (string, req), `customerEmail` (string, optional/empty), `appointmentDate`, `appointmentTime`, `productId`, `notes` | Form submits successfully; payload contains `customerEmail: null` or `""` | If email is provided but invalid format, display validation error; if omitted, no error. | `docs/spec/phieu_lam_ro_change_request.md` §II.1; `docs/spec/Câu-trả-lời.docx` #1 |
| 2 | CR-01: Chat Form & AI | Optional Email in AI Chat Flow | AI Chatbot does not require email to book or hold an appointment. AI prompt instructions remove mandatory email constraint; tool definitions allow null/empty email. | Chat messages containing customer name + phone; AI tool parameters: `customer_name`, `customer_phone`, optional `customer_email` | AI proceeds to confirm appointment once name and phone are collected, without looping to ask for email. | If user provides invalid email format, AI politely asks to recheck or skip. | `docs/spec/Thay_doi_-_bo_sung.docx` §1; `src/ai/tools.js`; `src/ai/orchestrator.js` |
| 3 | CR-01: API & Validation | Optional Email in Appointment APIs | `POST /api/appointments`, `POST /api/appointments/confirm-hold` accept empty or null `customerEmail`. Validates regex only if non-empty string. | JSON body with `customerEmail` omitted, `null`, or `""` | HTTP 200/201 Success; appointment record created with `customer_email: null` | Returns HTTP 400 only if `customerEmail` is a non-empty string that fails `EMAIL_REGEX`. | `src/services/appointmentService.js`; `src/routes/appointments.js` |
| 4 | CR-01: Lookup | Customer Lookup by Phone + Booking Code | Customer can look up appointment details using their mobile phone number combined with their unique booking code (`BK-YYYYMMDD-XXXX`). | `customerPhone` (string, Vietnamese mobile), `bookingCode` (string, e.g. `BK-20261030-4YQF`) | HTTP 200 JSON with appointment details: customer name, phone, email, date, time, duration, product name, status, booking code. | If no match found, returns HTTP 404 with error message: *"Không tìm thấy lịch hẹn phù hợp với số điện thoại và mã đặt lịch này"*. If phone invalid, HTTP 400. | `docs/spec/business_spec_booking.md` §2.1, §6.6, AC-17; `docs/spec/Câu-trả-lời.docx` #1 |
| 5 | CR-02: Timeout & Prompt | Slot Selection Inactivity Wait (5 Minutes) | When customer is at Step 10 (choosing a slot), system waits 5 minutes before sending an automated reminder. | Inactivity timer on conversation state `WAITING_SLOT_SELECTION` reaching 5 minutes. | Automated message sent: *"Bạn chọn giúp mình một khung giờ trống nhé. Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."* | If customer remains silent for another 5 minutes, triggers session closure. | `docs/spec/phieu_lam_ro_change_request.md` §II.2; `docs/spec/Câu-trả-lời.docx` #2; `docs/spec/Thay_doi_-_bo_sung.docx` §3 |
| 6 | CR-03: Holding Slot | Holding Slot TTL 5 Minutes | When a customer selects a slot, it is temporarily locked with status `holding` for exactly 5 minutes (TTL 5m). `hold_expires_at = now() + 5 * 60 * 1000`. | `conversationId`, `guestSessionId`, `appointmentDate`, `appointmentTime`, `durationMinutes`, `productId` | Holding appointment record created with `status: 'holding'`, `holding_token`, `hold_expires_at` (5 mins from now). | If slot already taken by confirmed appointment or active hold, returns HTTP 409 `SLOT_CONFLICT`. | `docs/spec/phieu_lam_ro_change_request.md` §II.4; `docs/spec/Câu-trả-lời.docx` #4; `src/repositories/appointmentRepository.js` |
| 7 | CR-03: Auto Release | Automatic Slot Release on Expiration | If a holding slot is not confirmed within 5 minutes, `cleanupExpiredHolds` or query-time check automatically sets status to `cancelled` and frees the slot. | Holding slot with `hold_expires_at <= now()` | Slot status updated to `cancelled` with note *"Holding slot expired (TTL 5m)"*. Slot becomes immediately available in `findAvailableSlots`. | If user tries to confirm an expired holding slot, returns HTTP 410 `HOLD_EXPIRED` with `preservedData` (name, phone, product) to reselect slot. | `docs/spec/business_spec_booking.md` §5.4; `docs/prepared/booking_process_analysis.md` §2.2.1; `src/repositories/appointmentRepository.js` |
| 8 | CR-04: Timeout Stage 1 | AI Session Stage 1 Inactivity Warning (5 Minutes) | In AI mode, after 5 minutes of silence from the customer's last message, system emits an automated contextual warning reminder. | 5 minutes elapsed since `last_customer_message_at` without customer reply; conversation mode `ai`. | System emits stage 1 warning message via Socket.IO & persists to messages table; sets `stage1_warning_sent = true`. | If customer sends a message before or after warning, timer resets and `stage1_warning_sent` is cleared. | `docs/spec/phieu_lam_ro_change_request.md` §II.3; `docs/spec/Câu-trả-lời.docx` #3; `docs/spec/Thay_doi_-_bo_sung.docx` §3 |
| 9 | CR-04: Stage 1 Messages | Context-Specific Automated Reminders | Contextual text for Stage 1 warning based on conversation phase: (a) Greeting, (b) Consultation, (c) Slot Selection, (d) Holding Slot. | Current conversation step / active hold state at 5-minute timeout. | (a) *"Bạn cần mình tư vấn dịch vụ nào ạ? Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."*<br>(b) *"Bạn muốn đặt lịch hay cần hỏi thêm gì không ạ? Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."*<br>(c) *"Bạn chọn giúp mình một khung giờ trống nhé. Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."*<br>(d) *"Giờ [X] đang giữ cho bạn, còn [N] phút. Bạn gửi họ tên, số điện thoại và xác nhận để chốt lịch nhé. Nếu không phản hồi, phiên chat kết thúc và giờ giữ sẽ được nhả ra."* | Fallback to general inactivity warning if phase undefined. | `docs/spec/Thay_doi_-_bo_sung.docx` §3; `docs/prepared/booking_process_analysis.md` §2.2.5 |
| 10 | CR-04: Timeout Stage 2 | AI Session Stage 2 Closure (Total 10 Minutes) | If customer does not reply for an additional 5 minutes after Stage 1 warning (10 minutes total silence), system automatically closes session. | 10 minutes total elapsed from customer silence (or 5 minutes post-warning). | Conversation updated to `mode: 'closed'`, `is_lead: true`; any active holding slot released; system message emitted; socket event `conversation_closed` broadcast. | None. Session is safely archived as read-only lead. | `docs/spec/phieu_lam_ro_change_request.md` §II.3; `docs/spec/Câu-trả-lời.docx` #3; `docs/prepared/booking_process_analysis.md` REQ-011 |
| 11 | CR-05: Closed Session | Read-Only Preservation on Closed Session | Closed conversations become strictly read-only. Prior messages and timestamps cannot be modified or appended to. | Attempt to send message to `conversationId` where `mode === 'closed'`. | Conversation remains immutable; old messages accessible for customer and admin review. | Direct write to closed conversation is blocked / redirected. | `docs/spec/phieu_lam_ro_change_request.md` §II.5; `docs/spec/Câu-trả-lời.docx` #5 |
| 12 | CR-05: Auto New Session | Automatic New Session on Closed Session Message | When a customer sends a message into a closed conversation or visits with a closed session, system automatically instantiates a fresh conversation. | Customer sends message (HTTP `/chat` or Socket `guest_message`) referencing closed conversation or session. | New conversation record created (`mode: 'ai'`); customer message attached to new conversation; response generated in new session; client notified with new conversation ID. | Old holding slots or expired state are discarded; clean slate. | `docs/spec/phieu_lam_ro_change_request.md` §II.5; `docs/spec/Câu-trả-lời.docx` #5 |
| 13 | CR-05: Greeting Reset | AI Fresh Greeting in New Session | In the newly spawned conversation, the AI welcomes the customer from the start with a clean greeting and context. | First interaction in the newly created conversation. | AI greeting message rendered: *"Xin chào! Chào mừng bạn quay trở lại với Salon Lumière. Mình có thể giúp gì cho bạn hôm nay?"* | Prior context not mixed into new booking logic unless explicitly restated by customer. | `docs/spec/Câu-trả-lời.docx` #5 |
| 14 | CR-06: Staff Timeout | 60-Minute Handover Timeout | When conversation is switched to human staff (`waiting_for_agent` or `human`), inactivity timeout is extended from 10 minutes to 60 minutes. | Mode change to `waiting_for_agent` or `human`. Inactivity timer watching `last_interaction_at`. | Inactivity timer set to 60 minutes. If 60 minutes elapse without staff or customer message, session auto-closes. | If customer switches back to AI (`switchBackToAI`), timeout reverts to standard 5m+5m AI model. | `docs/spec/phieu_lam_ro_change_request.md` §II.6; `docs/spec/Câu-trả-lời.docx` #6 |
| 15 | AC-01 | Valid Booking Confirmation | Booking with valid date (within 7 days), valid time within salon hours (08:30-20:30), required Name + Phone, and sufficient capacity across all needed slots. | `customerName`, `customerPhone`, `appointmentDate`, `appointmentTime`, `productId`, `durationMinutes` | Status `confirmed`, unique `booking_code` (`BK-YYYYMMDD-XXXX`), capacity deducted for all covered slots. | Missing required field -> 400; slot unavailable -> 409 `SLOT_CONFLICT`. | `docs/spec/business_spec_booking.md` §5.3, §17 AC-01 |
| 16 | AC-02 | Slot Start Unavailable Suggestion | When the requested start time or covered interval has 0 capacity, booking is rejected and alternative valid times are suggested. | Requesting booked-out time slot. | HTTP 409 `SLOT_CONFLICT`; response contains list of alternative available slots on that day (or next day if day full). | Rejects overbooking; does not create partial or pending appointment. | `docs/spec/business_spec_booking.md` §5.5, §5.6, §17 AC-02 |
| 17 | AC-03 | Concurrent Last-Slot Contention | When two concurrent requests vie for the last remaining slot at the exact same moment, only one succeeds. | Two simultaneous booking/confirm requests for 1 remaining slot. | First processed request receives `confirmed` (HTTP 200/201); second receives HTTP 409 `SLOT_CONFLICT` with alternative suggestions. | Atomicity guaranteed (mutex / atomic json store write); total capacity never exceeded. | `docs/spec/business_spec_booking.md` §5.5, §17 AC-03 |
| 18 | AC-04 | Duplicate Request Idempotency | Re-submitting the exact same confirmation token or holding token does not generate duplicate appointments. | Identical request resent (e.g. network retry, double click). | Returns previously confirmed appointment details with same `booking_code`. Capacity is deducted exactly once. | No duplicate appointment created; no extra capacity deducted. | `docs/spec/business_spec_booking.md` §5.5, §17 AC-04; `src/repositories/appointmentRepository.js:205` |
| 19 | AC-05 | Cancel Appointment & Restore Capacity | Canceling an existing appointment updates status to `cancelled` and immediately restores slot capacity. | Appointment ID, cancellation request by authorized user/guest/admin before appointment start time. | Status set to `cancelled`, updated timestamp recorded; slots freed up for subsequent bookings. | Canceling non-existent appointment -> 404; already cancelled -> 400; already completed -> 400. | `docs/spec/business_spec_booking.md` §5.4, §6.4, §17 AC-05 |
| 20 | AC-06 | Valid Reschedule Slot Transfer | Rescheduling updates appointment to new valid date/time, releasing old slots and occupying new slots. | Appointment ID, new date, new time within working hours and within 7-day limit. | Appointment updated with new date/time; old slots liberated, new slots occupied. | If new slot lacks capacity, reschedule rejected (see AC-07). | `docs/spec/business_spec_booking.md` §6.3, §17 AC-06 |
| 21 | AC-07 | Reschedule Lacks Capacity (Preserve Original) | If new time lacks capacity, reschedule fails; old appointment remains completely unchanged and valid. | Reschedule request to an occupied slot. | HTTP 409 `SLOT_CONFLICT`; original appointment retains original date, time, and occupied slot. Alternative slots suggested. | No partial update; capacity remains strictly consistent. | `docs/spec/business_spec_booking.md` §6.3, §17 AC-07 |
| 22 | AC-08 | Multi-Service Combo Calculation | Appointment with multiple services calculates cumulative price, cumulative duration, and reserves all contiguous slots. | List of service IDs (or combo) e.g. Cut (45m) + Perm (150m) = 195m. | Total price = sum of prices; Total duration = sum of durations; capacity checked and reserved for all contiguous slots spanned. | If contiguous span exceeds closing time (20:30) or any intermediate slot is full, request rejected. | `docs/spec/business_spec_booking.md` §5.2, §17 AC-08 |
| 23 | AC-09 | Closing Time Boundary Enforcement | Appointments must complete before or exactly at salon closing time (20:30). | Booking starting at 20:00 with 45-minute service (ends 20:45 > 20:30). | Rejected with validation error: appointment duration exceeds salon operating hours. | HTTP 400 Bad Request. | `docs/spec/business_spec_booking.md` §5.2, §17 AC-09 |
| 24 | AC-10 | Inactive Service Booking Prohibition | Services marked as inactive (`is_active: false` / `status: 'inactive'`) cannot be booked for new appointments. | Booking request specifying an inactive `product_id`. | HTTP 400 / 404: Service is no longer active and cannot be booked. | Historical appointments associated with this service retain their original data. | `docs/spec/business_spec_booking.md` §3.3, §17 AC-10 |
| 25 | AC-11 | Historical Price/Duration Immutability | Admin editing service price or duration only affects future bookings; existing appointments keep original values. | Admin updates service price from 150k to 180k. | Historical appointment records maintain `price: 150000`; new appointments created after update reflect 180k. | No retroactive recalculation on existing bookings. | `docs/spec/business_spec_booking.md` §3.3, §17 AC-11 |
| 26 | AC-12 | Capacity Reduction Constraint | Admin cannot reduce slot capacity below the number of currently confirmed/occupied bookings for that slot. | Admin attempts to set slot capacity = 1 when 2 confirmed appointments exist for that slot. | Request rejected: capacity cannot be lower than current active occupancy. | HTTP 400 Bad Request with explanation of affected appointments. | `docs/spec/business_spec_booking.md` §5.1, §17 AC-12 |
| 27 | AC-13 | Holiday & Closed Slot Blocking | System blocks new bookings on designated holidays or slots marked closed by Admin. | Booking attempt on holiday date or closed slot. | Rejected: salon is closed during the selected date/time. | Existing confirmed appointments are not deleted; admin is prompted to handle them. | `docs/spec/business_spec_booking.md` §4.2, §4.3, §17 AC-13 |
| 28 | AC-14 | Receptionist Direct In-Person Booking | Receptionists can create appointments directly at the counter; same validation rules apply. | Receptionist submits booking via admin/receptionist UI. | Appointment created with `status: 'confirmed'`; capacity deducted; booking code generated. | Must respect working hours, capacity, and max 7-day advance booking limit. | `docs/spec/business_spec_booking.md` §6.1, §17 AC-14; `docs/spec/N1.QLQTKD.md` |
| 29 | AC-15 | RBAC & Permission Enforcement | Enforcement of role permissions: Receptionist cannot update service pricing, delete services, manage staff accounts, or perform unauthorized status updates. | Receptionist calls `PUT /api/appointments/:id/status` (forbidden) or service management endpoints. | HTTP 403 Forbidden (`forbidReceptionist` / `requireStaff`). | Unauthorized actions rejected at API middleware layer, not just hidden on UI. | `docs/spec/business_spec_booking.md` §2.2, §12, §17 AC-15; `src/middleware/auth.js` |
| 30 | AC-16 | Chat Continuation via Chat Code / Session | Customer can retrieve and continue a previous conversation using their unique chat code or session identifier. | `conversationId` or `guestSessionId`. | Returns conversation message history and active status. | If conversation not found -> 404; if closed, opens in read-only and allows new session on reply (CR-05). | `docs/spec/business_spec_booking.md` §9, §17 AC-16 |
| 31 | AC-17 | Appointment Lookup by Phone & Booking Code | Customer looks up appointment using Phone number + Booking Code. | `phone`, `booking_code` | Complete appointment details (date, time, status, services, staff). | Mismatch or non-existent booking code -> 404 Not Found. | `docs/spec/business_spec_booking.md` §6.6, §17 AC-17; `docs/spec/Câu-trả-lời.docx` #1 |
| 32 | AC-18 | Appointment Audit Trail & History | Admin and Receptionist can view change history of an appointment, including timestamps, modified fields, and author. | Appointment detail view by Admin/Staff. | Displays historical timeline of state changes (`holding` -> `confirmed` -> `completed` / `cancelled`), reschedule timestamps, and operator ID. | Read-only audit log; cannot be tampered with. | `docs/spec/business_spec_booking.md` §11.2, §17 AC-18 |
| 33 | AC-19 | Search, Filter & Reporting Consistency | Search appointments by date range, customer name, phone, status, and staff accurately reflects underlying database records. | Search query parameters: `date`, `status`, `page`, `limit`, `search`. | Paginated array of appointment records matching exact filter criteria, with `meta: { total }`. | No cached stale data; counts match filtered totals. | `docs/spec/business_spec_booking.md` §6.6, §13, §17 AC-19 |
| 34 | AC-20 | Existing Architecture & UI Preservation | All changes must be integrated into the existing codebase architecture (Node.js/Express, Mock JSON Database `database/data/`, Vanilla JS UI, Socket.IO) without rewrites. | Architecture constraint on all changes. | Preserved directory structure, UI layout, mock database format, and core conventions. | No external database introduction (Postgres/Redis) or replacement frameworks. | `docs/spec/business_spec_booking.md` §1, §17 AC-20; `ORIGINAL_REQUEST.md` R5 |
| 35 | Salon Spec | Working Hours 08:30 - 20:30 | Salon Lumière operates strictly from 08:30 to 20:30 every day of the week. Slot intervals start at 08:30 and latest start depends on duration. | `business_settings.json` key `working_hours`. | Slots generated: `08:30`, `09:15`, `10:00`, etc., or 30-min increments `08:30`, `09:00`, `09:30` ... up to closing. | Booking requested outside 08:30 - 20:30 is rejected with 400. | `docs/spec/N1.QLQTKD.md` §Web Salon; `docs/prepared/booking_process_analysis.md` §2.2.3 |
| 36 | Salon Spec | 78 Service Variations (Catalog) | Catalog contains 8 primary categories, 26 core services, and 78 variations based on hair size (S: short cằm trở lên, M: medium cằm đến vai, L: long ngang ngực trở xuống). | Category, Service Name, Size (S/M/L). | Specific price, duration in minutes (20m to 240m), and staff required (1 or 2 stylists). | Selecting undefined size or service code returns 400. | `docs/spec/N1.QLQTKD.md` §Bảng Dịch Vụ; `docs/prepared/n1_qlqtkd.json` |
| 37 | Salon Spec | Max Advance Booking Limit (7 Days) | Customers may only book appointments up to a maximum of 7 calendar days into the future. | `appointmentDate > today + 7 days`. | Booking rejected: *"Chỉ được đặt lịch trước tối đa 7 ngày"*. | HTTP 400 Bad Request. | `docs/spec/business_spec_booking.md` §2.1, §5.3 |
| 38 | Salon Spec | Lead Capture on Timeout (Lead Saved) | When a session auto-closes due to inactivity, customer details and interest are flagged as `is_lead = true` for salon marketing. | Conversation auto-close event at Stage 2. | Conversation updated with `is_lead: true`, `lead_notes: "BPMN Timeout - Lead Saved"`, customer name/phone if available. | Staff can view leads in closed conversation list. | `docs/prepared/booking_process_analysis.md` §2.1.6, REQ-011 |

---

## Edge Cases

| # | Feature | Input | Observed / Specified Behavior |
|---|---------|-------|-------------------------------|
| 1 | CR-01: Optional Email | `customerEmail: ""` (empty string) on web form | Treated as `null`; passes validation; appointment record created with `customer_email: null`. |
| 2 | CR-01: Optional Email | `customerEmail: "   "` (whitespace only) | Trimmed to `""`, treated as `null`; passes validation without triggering regex error. |
| 3 | CR-01: Optional Email | `customerEmail: null` or omitted in JSON payload | Treated as `null`; passes validation; appointment created successfully. |
| 4 | CR-01: Optional Email | `customerEmail: "invalid-email-format"` | Fails regex validation; returns HTTP 400 with message *"Email không hợp lệ. Vui lòng nhập địa chỉ email chính xác..."*. |
| 5 | CR-01: Optional Email | Customer in AI chat provides only: *"Mình tên Hùng, số 0912345678, đặt lúc 14:00 ngày mai"* | AI does NOT ask for email; AI calls `hold_appointment_slot` and then `confirm_appointment` with `customer_email: null` / omitted; booking succeeds. |
| 6 | CR-01: Lookup | Lookup with lowercase booking code: `phone="0912345678"`, `code="bk-20261030-4yqf"` | Case-insensitive match succeeds; returns appointment details. |
| 7 | CR-01: Lookup | Lookup with phone containing spaces/dashes: `phone="091 234 5678"` or `"+84912345678"` | Sanitized via `cleanPhoneNumber` to `"0912345678"`; matches record; returns appointment. |
| 8 | CR-01: Lookup | Valid booking code but phone number belongs to another customer | Fails match; returns HTTP 404 (prevents unauthorized access to stranger's booking details). |
| 9 | CR-01: Lookup | Appointment exists but was created with `customer_email: null` | Lookup by Phone + Booking Code succeeds perfectly; email displays as `null` or "Chưa cung cấp". |
| 10 | CR-02: Slot Selection | Customer stays silent for 4m59s on slot selection | Inactivity timer has not reached 5m; no automated reminder sent yet. |
| 11 | CR-02: Slot Selection | Customer stays silent for 5m01s on slot selection | Inactivity timer fires; system posts automated message: *"Bạn chọn giúp mình một khung giờ trống nhé. Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."* |
| 12 | CR-02: Slot Selection | Customer replies at 6m (1 minute after reminder) | Customer interaction detected; timer resets to 0; conversation continues in active state. |
| 13 | CR-03: Holding Slot TTL | Customer confirms hold at exactly 4m59s after hold created | `hold_expires_at > now()`; validation succeeds; appointment transitions from `holding` to `confirmed`. |
| 14 | CR-03: Holding Slot TTL | Customer confirms hold at 5m02s after hold created | `hold_expires_at <= now()`; slot is expired; status changed to `cancelled`; returns HTTP 410 `HOLD_EXPIRED` with `preservedData`. |
| 15 | CR-03: Holding Slot TTL | Another customer checks `findAvailableSlots` after 5m01s of an unconfirmed hold | `cleanupExpiredHolds()` automatically marks expired hold as `cancelled`; slot appears as available in returned list. |
| 16 | CR-03: Holding Slot Conflict | Guest A holds 09:00 (TTL 5m); Guest B tries to hold 09:00 at minute 2 | Guest B receives HTTP 409 `SLOT_CONFLICT` because Guest A's hold is still active (`hold_expires_at > now()`). |
| 17 | CR-04: AI Inactivity Timeout | Customer chats, AI replies, customer sends no further messages for 5 mins | Stage 1 reminder triggered with context-appropriate message; `stage1_warning_sent = true`. |
| 18 | CR-04: AI Inactivity Timeout | Customer receives Stage 1 reminder at 5m, stays silent until 10m total | Stage 2 triggers: session auto-closes (`mode: 'closed'`, `is_lead: true`); holding slot released; socket broadcasts `conversation_closed`. |
| 19 | CR-04: AI Inactivity Timeout | Customer sends message at minute 9 (4 minutes after Stage 1 reminder) | Customer message received; session remains open; `stage1_warning_sent` reset to false; timer resets to 0. |
| 20 | CR-05: Message Closed Session | Customer sends message via HTTP `/api/conversations/:id/chat` where `:id` is `closed` | System does NOT reject with 400 error. It preserves old session `:id` unchanged, creates new conversation `newId`, and processes customer message with fresh AI greeting. |
| 21 | CR-05: Message Closed Session | Customer sends socket message `guest_message` to a closed conversation | Old conversation remains read-only; new conversation initialized for guest session; greeting emitted to new room. |
| 22 | CR-05: Multiple Closed Sessions | Customer has 2 older closed sessions and opens chat widget | Old sessions remain in history; widget opens current active session or creates fresh active session. |
| 23 | CR-06: Staff Handover | Customer requests agent at minute 4 of AI silence | Mode switches to `waiting_for_agent`. AI 5m timeout is cancelled. 60-minute staff timeout starts. |
| 24 | CR-06: Staff Handover | Staff claims conversation at minute 25 and chats with customer | `updated_at` updated; 60-minute inactivity timer resets. |
| 25 | CR-06: Staff Handover | Neither customer nor staff sends any message for 60 consecutive minutes | Inactivity timer reaches 60m; conversation automatically closed (`mode: 'closed'`); notification sent to agents room. |
| 26 | CR-06: Switch Back to AI | Customer clicks "Quay lại Trợ lý AI" after 20 minutes in waiting mode | Mode switches back to `ai`. 60-minute staff timeout cancelled; 5m+5m AI 2-stage timeout reinstated from current timestamp. |
| 27 | AC-01: Advance Limit | Booking on day 8 from today | Rejected: booking date exceeds maximum 7-day advance booking window. |
| 28 | AC-03: Race Condition | Two requests simultaneously call `confirmHoldingSlot` for same slot | JsonStore atomic lock ensures only first write commits; second detects `isSlotOccupiedByAppt` and throws 409 `SLOT_CONFLICT`. |
| 29 | AC-04: Idempotency | Client double-clicks confirm button, firing 2 identical requests within 50ms | First commits; second finds `appt.status === 'confirmed'` and returns identical enriched appointment without error. |
| 30 | AC-08: Multi-service Combo | Service 1 (Gội đầu 20m) + Service 2 (Uốn ART 150m) starting at 18:30 | Total duration = 170m. 18:30 + 170m = 21:20 > Closing time 20:30. Request rejected (AC-09). |
| 31 | AC-11: Price Change | Service price updated from 130k to 160k at 10:00. Booking made at 09:30 for 15:00 today | Booking at 09:30 retains price 130k. Booking created at 10:05 gets price 160k. |
| 32 | AC-15: RBAC | Receptionist attempts to call `DELETE /api/products/:id` | Blocked by `roleMiddleware(['admin'])` or `forbidReceptionist`; returns HTTP 403 Forbidden. |
| 33 | AC-15: RBAC | Receptionist attempts to update appointment status to `cancelled` via staff route | Allowed: Receptionist has full appointment management rights (create, edit, cancel, view). |
| 34 | AC-17: Lookup | Phone number formatted as `0901234567` vs stored `+84901234567` | Sanitized comparison matches; returns appointment data. |
| 35 | Database Concurrency | Rapid concurrent file operations on JSON mock database | `jsonStore.js` atomic rename (`.tmp.xxx` -> `.json`) prevents file corruption and data loss. |

---

## Detailed Data Models & Interface Contracts

### 1. Appointment Schema (`appointments.json`)
```json
{
  "id": "UUID (PK)",
  "user_id": "UUID | null",
  "conversation_id": "UUID | null",
  "guest_session_id": "string",
  "holding_token": "UUID | null",
  "confirmation_token": "UUID",
  "booking_code": "string | null (e.g. BK-20261030-4YQF)",
  "customer_name": "string | null",
  "customer_phone": "string | null (10 digits)",
  "customer_email": "string | null (OPTIONAL: may be null or valid email)",
  "product_id": "string | null",
  "appointment_date": "string (YYYY-MM-DD)",
  "appointment_time": "string (HH:mm)",
  "duration_minutes": "integer (default 30-45)",
  "status": "holding | pending | confirmed | in_progress | completed | cancelled | no_show",
  "hold_expires_at": "ISO8601 string | null (TTL 5 mins for holding)",
  "notes": "string | null",
  "confirmed_at": "ISO8601 string | null",
  "created_at": "ISO8601 string",
  "updated_at": "ISO8601 string"
}
```

### 2. Conversation Schema (`conversations.json`)
```json
{
  "id": "UUID (PK)",
  "guest_session_id": "string",
  "mode": "ai | waiting_for_agent | human | closed",
  "assigned_to": "UUID | null (Staff user ID)",
  "product_context_id": "string | null",
  "customer_name": "string | null",
  "customer_phone": "string | null",
  "customer_email": "string | null (optional)",
  "is_lead": "boolean (true if closed with customer details / timeout)",
  "lead_notes": "string | null",
  "stage1_warning_sent": "boolean (tracks if 5m reminder was dispatched)",
  "last_customer_message_at": "ISO8601 string | null",
  "last_interaction_at": "ISO8601 string",
  "created_at": "ISO8601 string",
  "updated_at": "ISO8601 string",
  "agent_last_read_at": "ISO8601 string | null"
}
```

### 3. API Contract Updates

#### Endpoint: `POST /api/appointments/lookup` (or `GET /api/appointments/lookup`)
- **Request Body / Query**:
  ```json
  {
    "phone": "0901234567",
    "bookingCode": "BK-20261030-4YQF"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "298da9b8-ff92-4da3-a004-72c67935c01d",
      "booking_code": "BK-20261030-4YQF",
      "customer_name": "Nguyễn Văn An",
      "customer_phone": "0901234567",
      "customer_email": null,
      "product_name": "Cắt tạo kiểu (Size M)",
      "appointment_date": "2026-10-30",
      "appointment_time": "09:00",
      "duration_minutes": 45,
      "status": "confirmed",
      "notes": "Chốt lịch hẹn cắt tóc layer",
      "confirmed_at": "2026-10-28T17:59:51.082Z"
    }
  }
  ```
- **Error Response (404 Not Found)**:
  ```json
  {
    "success": false,
    "error": "Không tìm thấy lịch hẹn phù hợp với số điện thoại và mã đặt lịch này"
  }
  ```

#### Endpoint: `POST /api/appointments/confirm-hold`
- **Request Body** (Note `customerEmail` is optional):
  ```json
  {
    "holdingToken": "364e98b9-5be8-47be-95f8-af084e548f0d",
    "customerName": "Nguyễn Văn A",
    "customerPhone": "0901234567",
    "customerEmail": null,
    "notes": "Tóc ngắn uốn nhẹ"
  }
  ```
- **TTL Expiration (410 Gone)**:
  ```json
  {
    "success": false,
    "code": "HOLD_EXPIRED",
    "error": "Thời hạn giữ chỗ 5 phút đã hết. Vui lòng chọn lại khung giờ.",
    "preservedData": {
      "customerName": "Nguyễn Văn A",
      "customerPhone": "0901234567",
      "customerEmail": null,
      "productId": "service-01"
    }
  }
  ```

---

## Traceability & Dependency Matrix

| Requirement | Code Files Affected | Test Files Affected | Documentation Source |
|:---|:---|:---|:---|
| **CR-01** (Optional Email & Phone Lookup) | `public/appointments.html`, `public/js/chat.js`, `src/services/appointmentService.js`, `src/routes/appointments.js`, `src/ai/tools.js`, `src/ai/orchestrator.js`, `src/repositories/appointmentRepository.js` | `tests/booking_process_salons.test.js`, new CR-01 test suite | `Câu-trả-lời.docx` Q1; `business_spec_booking.md` §2.1, §6.6, AC-17 |
| **CR-02** (5-Min Slot Selection Wait) | `src/ai/orchestrator.js`, `src/services/conversationService.js`, `src/chat/socketHandler.js` | `tests/booking_process_salons.test.js` | `Câu-trả-lời.docx` Q2; `Thay_doi_-_bo_sung.docx` §3 |
| **CR-03** (Holding Slot TTL 5m) | `src/repositories/appointmentRepository.js` (`HOLD_DURATION_MS = 5 * 60 * 1000`), `src/routes/appointments.js`, `src/ai/tools.js`, `src/ai/orchestrator.js` | `tests/booking_process_salons.test.js` | `Câu-trả-lời.docx` Q4; `business_spec_booking.md` §5.4 |
| **CR-04** (AI 2-Stage Timeout 5m+5m) | `src/services/conversationService.js`, `src/repositories/conversationRepository.js`, `src/chat/socketHandler.js`, timeout worker/scheduler | `tests/` timeout test suite | `Câu-trả-lời.docx` Q3; `Thay_doi_-_bo_sung.docx` §2, §3 |
| **CR-05** (Closed Session Read-Only & Auto-New) | `src/routes/conversations.js`, `src/services/conversationService.js`, `src/chat/socketHandler.js`, `public/js/chat.js` | `tests/` session lifecycle test suite | `Câu-trả-lời.docx` Q5; `business_spec_booking.md` §9 |
| **CR-06** (Staff Handover 60m Timeout) | `src/services/conversationService.js`, `src/chat/socketHandler.js` | `tests/` handoff timeout test suite | `Câu-trả-lời.docx` Q6; `business_spec_booking.md` §9 |
| **AC-01 to AC-20** (Core Booking Spec) | `src/repositories/appointmentRepository.js`, `src/services/appointmentService.js`, `src/routes/appointments.js`, `src/routes/admin.js`, `src/middleware/auth.js` | `tests/` all booking suites | `business_spec_booking.md` §17 AC-01..AC-20 |
