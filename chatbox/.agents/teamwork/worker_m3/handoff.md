# Handoff Report — Worker M3 (Milestone 3: Session Lifecycle & 2-Stage Timeout)

## 1. Observation
- `src/services/sessionTimeoutService.js`: Created new service providing `start(io, intervalMs)`, `stop()`, and `checkTimeouts(io, options)`. Configured with `DEFAULT_AI_WARNING_MS = 5 * 60 * 1000` (5 minutes), `DEFAULT_AI_CLOSE_MS = 10 * 60 * 1000` (10 minutes total), and `DEFAULT_HUMAN_CLOSE_MS = 60 * 60 * 1000` (60 minutes).
- Warning message verbatim from spec:
  `"Dạ em thấy mình đang bận, phiên chat sẽ tự động kết thúc sau 5 phút nữa nếu không có tương tác ạ. Nếu cần hỗ trợ thêm, anh/chị cứ nhắn em nhé!"`
- Stage 2 close sets `mode = 'closed'`, `is_lead = true`, `closed_at = new Date().toISOString()`, emits `conversation_closed` via Socket.IO, adds system closing message, and releases holding slots.
- `src/services/conversationService.js`: Added `sendMessage(convId, messageData)` conforming to `PROJECT.md` interface contract lines 72-77. When `conv.mode === 'closed'`, preserves the old conversation as read-only history, creates a new active session (`mode: 'ai'`), generates a fresh Salon Lumière greeting message:
  `"Xin chào! Chào mừng bạn quay trở lại với Salon Lumière. Em có thể hỗ trợ gì cho bạn hôm nay ạ?"`, attaches customer message and AI response, and emits to Socket.IO.
- `src/routes/conversations.js`: Updated `POST /api/conversations/:id/chat` and `POST /api/conversations/:id/message`. When `:id` has `mode === 'closed'`, delegates to `conversationService.sendMessage` and returns HTTP 200 with `{ isNewSession: true, newConversationId, conversation, greeting, message }`. Calls `sessionTimeoutService.resetInactivityWarning(conversationId)` on active user message.
- `src/chat/socketHandler.js`: In `guest_message` socket listener, if `conv.mode === 'closed'`, calls `conversationService.sendMessage`, joins the socket to `conv_${result.conversation.id}`, and emits `new_conversation_created`. Resets warning and touches `updated_at` on active interaction.
- `src/app.js`: Started `sessionTimeoutService.start(io)` in `start()`, and exported `sessionTimeoutService` in `module.exports`.
- `public/chat.html` & `public/js/chat.js`: Rebranded to Salon Lumière. Added responsive `#closed-session-banner` alerting the customer that the previous session has ended and any new message will start a fresh session. In `public/js/chat.js`, `sendMessage()` handles `mode === 'closed'` seamlessly without locking the input, transitions the UI to the newly returned session, joins the new socket room, and displays the greeting.
- Verification command outputs:
  - `node -c src/services/sessionTimeoutService.js src/services/conversationService.js src/routes/conversations.js src/chat/socketHandler.js src/app.js public/js/chat.js`: Exited code 0 with no syntax errors.
  - `node --test tests/conversations.test.js`: Passed 5/5 subtests in 2.14s.
  - Programmatic unit verification of CR-04, CR-05, CR-06:
    - Stage 1 warning at 5m: passed (`warning_sent: true`).
    - Stage 2 auto-close at 10m: passed (`mode: 'closed'`, `is_lead: true`, `closed_at` set).
    - Closed session re-engagement: passed (old conversation remains closed, new conversation spawned with Salon Lumière greeting).
    - Staff handover 60m timeout: passed (suspended at 10m, closed at 60m).
  - HTTP verification of `POST /api/conversations/:id/chat` with closed `:id`: HTTP 200 returned with `isNewSession: true`, new conversation created, greeting dispatched, and old conversation preserved.

## 2. Logic Chain
1. CR-04 requires a 2-stage timeout in AI mode: after 5 minutes of silence, send a warning message and set `warning_sent = true`. If after an additional 5 minutes (total 10 minutes) customer remains silent, transition to `mode = 'closed'`, `is_lead = true`, and record `closed_at`.
   - In `sessionTimeoutService.js`, `checkTimeouts()` compares elapsed silence against `aiWarningMs`. Once reaching 5 minutes, it persists the warning message and marks `conv.warning_sent = true`. If the warning was already sent and `stage2Duration >= (aiCloseMs - aiWarningMs)`, it sets `mode = 'closed'`, `is_lead = true`, records `closed_at`, releases holding slots, and emits `conversation_closed`.
2. CR-05 requires returning customer to a closed session to retain the old conversation as read-only history, automatically instantiate a new conversation (`mode: 'ai'`), trigger a fresh AI greeting, and return the new conversation.
   - In `src/services/conversationService.js:sendMessage`, `src/routes/conversations.js`, and `src/chat/socketHandler.js`, whenever a message is sent to a closed conversation, the system does not reject with 400. Instead, it preserves the existing closed conversation immutable in `database/data/conversations.json`, creates a new record via `conversationRepo.create`, carries forward customer profile details, inserts a greeting from Salon Lumière, processes the user query with `orchestrator.chat`, and notifies client via REST response and Socket.IO.
3. In `public/js/chat.js`, allowing the customer to type seamlessly into a closed session fulfills the UX requirement: input remains active, closed banner guides the user, and sending immediately launches the new conversation.
4. CR-06 requires human staff handover to suspend AI 10-minute timeout and apply a 60-minute timeout.
   - In `sessionTimeoutService.js`, `if (conv.mode === 'human' || conv.mode === 'waiting_for_agent')`, the AI warning/close logic is completely bypassed. It only closes if `now - lastInteraction >= humanCloseMs` (60 minutes).
5. All 7 modified/created files are strictly within the Exclusive Write Boundaries assigned to Worker M3.

## 3. Caveats
- `sessionTimeoutService.start()` runs an interval every 15 seconds in production/app startup; in tests, `checkTimeouts(io, options)` can be invoked synchronously with custom simulated timestamps `options.now` for instant, non-flaky test execution.
- External AI Provider: When Ollama/OpenAI is offline, `orchestrator.chat` gracefully falls back to maintenance messaging or mock reply; `conversationService.sendMessage` properly captures this via `aiConfigured: false` without breaking session creation.
- No caveats regarding write boundary violations; only assigned files were modified.

## 4. Conclusion
Milestone 3 (CR-04, CR-05, CR-06) is fully implemented, strictly genuine (no dummy or hardcoded checks), and verified end-to-end against all business acceptance criteria and interface contracts.

## 5. Verification Method
To independently verify:
1. Syntax check:
   ```powershell
   node -c src/services/sessionTimeoutService.js src/services/conversationService.js src/routes/conversations.js src/chat/socketHandler.js src/app.js public/js/chat.js
   ```
2. Existing conversation regression test:
   ```powershell
   node --test tests/conversations.test.js
   ```
3. End-to-end CR-04, CR-05, CR-06 verification script:
   ```powershell
   node -e "
   const assert = require('node:assert/strict');
   const { v4: uuidv4 } = require('uuid');
   const conversationRepo = require('./src/repositories/conversationRepository');
   const messageRepo = require('./src/repositories/messageRepository');
   const conversationService = require('./src/services/conversationService');
   const sessionTimeoutService = require('./src/services/sessionTimeoutService');

   async function run() {
     const sid = uuidv4();
     const c = await conversationRepo.create({ guestSessionId: sid });
     const now = Date.now();

     // Stage 1 warning test
     await sessionTimeoutService.checkTimeouts(null, { now: now + 5*60*1000 + 1000, aiWarningMs: 5*60*1000, aiCloseMs: 10*60*1000 });
     const c1 = await conversationRepo.findById(c.id);
     assert.equal(c1.warning_sent, true);

     // Stage 2 close test
     await sessionTimeoutService.checkTimeouts(null, { now: now + 10*60*1000 + 2000, aiWarningMs: 5*60*1000, aiCloseMs: 10*60*1000 });
     const c2 = await conversationRepo.findById(c.id);
     assert.equal(c2.mode, 'closed');
     assert.equal(c2.is_lead, true);
     assert.ok(c2.closed_at);

     // CR-05 re-engagement test
     const r = await conversationService.sendMessage(c2.id, { guestSessionId: sid, message: 'Dat lich lam toc' });
     assert.equal(r.isNewSession, true);
     assert.notEqual(r.conversation.id, c2.id);
     assert.equal(r.conversation.mode, 'ai');

     // CR-06 staff timeout test
     const staffC = await conversationRepo.create({ guestSessionId: uuidv4() });
     await conversationRepo.updateMode(staffC.id, 'human', 'staff-1');
     const staffNow = Date.now();
     await sessionTimeoutService.checkTimeouts(null, { now: staffNow + 10*60*1000, humanCloseMs: 60*60*1000 });
     const sc1 = await conversationRepo.findById(staffC.id);
     assert.equal(sc1.mode, 'human'); // suspended at 10m
     await sessionTimeoutService.checkTimeouts(null, { now: staffNow + 60*60*1000 + 2000, humanCloseMs: 60*60*1000 });
     const sc2 = await conversationRepo.findById(staffC.id);
     assert.equal(sc2.mode, 'closed'); // closed at 60m

     console.log('ALL VERIFICATIONS PASSED 100%');
   }
   run();
   "
   ```
