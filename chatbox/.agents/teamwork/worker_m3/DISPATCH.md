# Dispatch — Worker M3: Session Lifecycle & 2-Stage Timeout (Nhóm 3)

## Scope & Objective
Implement CR-04, CR-05, and CR-06:
1. Two-stage chat session timeout (CR-04):
   - Total timeout is 10 minutes.
   - Stage 1: After 5 minutes of customer silence/inactivity in AI mode (`mode === 'ai'`), send warning message:
     `"Dạ em thấy mình đang bận, phiên chat sẽ tự động kết thúc sau 5 phút nữa nếu không có tương tác ạ. Nếu cần hỗ trợ thêm, anh/chị cứ nhắn em nhé!"` (or equivalent polite warning). Emit via Socket.IO and persist message in conversation. Mark `warning_sent = true` on the conversation.
   - Stage 2: If customer remains silent for an additional 5 minutes (total 10 minutes since last interaction), transition conversation to `mode = 'closed'`, `is_lead = true`, `closed_at = new Date().toISOString()`, and emit session closed notification.
2. Returning customer to closed session (CR-05):
   - When a customer sends a message into a conversation with `mode === 'closed'`:
     - The old conversation remains in `closed` mode as read-only history.
     - Automatically create a NEW active conversation (`mode: 'ai'`) linked to the user/guest session.
     - Automatically trigger a fresh AI greeting message in the new session.
     - Return the new conversation and message response.
   - In `public/js/chat.js` and `public/chat.html`:
     - If viewing a closed conversation, show indication that session is closed/read-only or smoothly transition to new session when customer inputs a new message.
     - Update UI to brand as Salon Lumière rather than generic store.
3. Human staff handover extended timeout (CR-06):
   - When conversation is handed over to real staff (`mode === 'human'` or `'waiting_for_agent'`), the 10-minute AI timeout is suspended.
   - Apply a 60-minute inactivity timeout: if 60 minutes elapse without any interaction between customer and staff, auto-close the conversation (`mode = 'closed'`).
4. Background Scheduler Service:
   - Create `src/services/sessionTimeoutService.js` running a periodic check (e.g. `setInterval` every 15–30 seconds) that scans active conversations in `jsonStore` or `conversationService`.
   - Ensure the service starts gracefully in `src/app.js` (or server startup), with a clean `stop()` method for tests.

## Exclusive Write Ownership
You own ONLY these files:
- `src/services/sessionTimeoutService.js` (NEW)
- `src/services/conversationService.js`
- `src/routes/conversations.js`
- `src/chat/socketHandler.js`
- `public/js/chat.js`
- `public/chat.html`
- `src/app.js`
DO NOT modify any other files.

## References
- `d:\projects\chatbox\.agents\teamwork\ORIGINAL_REQUEST.md`
- `d:\projects\chatbox\.agents\teamwork\orchestrator\PROJECT.md`
- `d:\projects\chatbox\.agents\teamwork\spec_miner_survey_1_gen2\spec_inventory.md`
- `d:\projects\chatbox\.agents\teamwork\explorer_survey_1_gen2\codebase_analysis.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.


## 2026-10-30T07:23:44Z
[Message] timestamp=2026-10-30T07:23:44Z sender=268096b1-4ea4-4135-bf9f-c4f8c0abc985 priority=MESSAGE_PRIORITY_HIGH content=You are worker_m3. Your working directory is d:\projects\chatbox\.agents\teamwork\worker_m3.
Your parent orchestrator is conversation ID 268096b1-4ea4-4135-bf9f-c4f8c0abc985.

MANDATORY FIRST STEPS:
1. Read d:\projects\chatbox\.agents\teamwork\ORIGINAL_REQUEST.md before starting any work.
2. Read d:\projects\chatbox\.agents\teamwork\worker_m3\DISPATCH.md.
3. Read d:\projects\chatbox\.agents\teamwork\orchestrator\PROJECT.md.
4. Initialize your BRIEFING.md and progress.md in your working directory.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE WRITE BOUNDARIES:
You own ONLY these files:
- src/services/sessionTimeoutService.js (NEW)
- src/services/conversationService.js
- src/routes/conversations.js
- src/chat/socketHandler.js
- public/js/chat.js
- public/chat.html
- src/app.js
DO NOT modify any other files.

TASK DETAILS:
Implement CR-04, CR-05, and CR-06:
1. Two-stage chat session timeout (CR-04):
   - In AI mode (`mode === 'ai'`), after 5 minutes of inactivity/silence, send a polite warning message:
     `"Dạ em thấy mình đang bận, phiên chat sẽ tự động kết thúc sau 5 phút nữa nếu không có tương tác ạ. Nếu cần hỗ trợ thêm, anh/chị cứ nhắn em nhé!"`.
     Emit message through Socket.IO and persist in the conversation. Mark `warning_sent = true` on the conversation.
   - If after an additional 5 minutes (total 10 minutes from last activity) customer has not sent any message, close the conversation: `mode = 'closed'`, `is_lead = true`, `closed_at = new Date().toISOString()`, and emit session closed notification.
2. Returning customer to closed session (CR-05):
   - When customer sends a message into a conversation with `mode === 'closed'`:
     - The old conversation remains in `closed` mode as read-only history.
     - Automatically create a NEW active conversation (`mode: 'ai'`) for that guest/user session.
     - Automatically trigger fresh AI greeting in the new session.
     - Return the newly created conversation and response to the client.
   - In `public/js/chat.js` & `public/chat.html`: Update chat UI: handle closed session display, allow customer to type new message to seamlessly start a new conversation; polish branding to Salon Lumière.
3. Staff handover timeout (CR-06):
   - When conversation enters `mode === 'human'` or `'waiting_for_agent'`, suspend AI 10-minute timeout.
   - Apply a 60-minute inactivity timeout: if 60 minutes pass without interaction, auto close conversation (`mode = 'closed'`).
4. Background Scheduler:
   - Create `src/services/sessionTimeoutService.js` to scan active conversations periodically (e.g. every 15-30s). Provide `start()` and `stop()` methods. Start it in `src/app.js` (or server initialization).

VERIFICATION & HANDOFF:
- Test your changes thoroughly (run syntax checks and verification commands).
- Write handoff.md in your working directory following the 5-component protocol: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
- Send a message to parent orchestrator (268096b1-4ea4-4135-bf9f-c4f8c0abc985) when done.
