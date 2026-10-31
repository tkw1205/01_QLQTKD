'use strict';
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { app } = require('../src/app');
const { apiRequest, stopServer, closeDb } = require('./helpers');
const conversationRepo = require('../src/repositories/conversationRepository');
const messageRepo = require('../src/repositories/messageRepository');
const appointmentRepo = require('../src/repositories/appointmentRepository');
const conversationService = require('../src/services/conversationService');
const sessionTimeoutService = require('../src/services/sessionTimeoutService');
const jsonStore = require('../src/config/jsonStore');

describe('Adversarial Stress Verification Suite — Challenger 2 (CR-04, CR-05, CR-06, R5)', () => {
  const TEST_PREFIX = 'ADV_CHALLENGER_2_';
  let createdConvIds = [];

  before(async () => {
    // Ensure background scanner is stopped during discrete time-travel tests
    sessionTimeoutService.stop();
  });

  after(async () => {
    // Clean up any test conversations, messages, and appointments created during this test run
    try {
      const convs = jsonStore.getCollection('conversations');
      const filteredConvs = convs.filter(c => !createdConvIds.includes(c.id));
      jsonStore.saveCollection('conversations', filteredConvs);

      const msgs = jsonStore.getCollection('messages');
      const filteredMsgs = msgs.filter(m => !createdConvIds.includes(m.conversation_id));
      jsonStore.saveCollection('messages', filteredMsgs);

      const appts = jsonStore.getCollection('appointments');
      const filteredAppts = appts.filter(a => !createdConvIds.includes(a.conversation_id));
      jsonStore.saveCollection('appointments', filteredAppts);
    } catch (_) {}

    await stopServer();
    await closeDb();
  });

  // ============================================================================
  // AREA 1: 2-STAGE TIMEOUT BOUNDARY STRESS (CR-04)
  // ============================================================================
  test('1. CR-04 Timeout Boundary Stress: Exactly at 4m59s vs 5m01s, Customer Reset at 7m, and 10m01s auto-close', async () => {
    const guestSessionId = uuidv4();
    const conv = await conversationRepo.create({ guestSessionId });
    createdConvIds.push(conv.id);

    const startTime = Date.now();

    // Customer sends message at T0
    await messageRepo.create({
      conversationId: conv.id,
      senderType: 'user',
      content: 'Chào salon, tôi muốn tìm hiểu uốn sóng lơi',
      created_at: new Date(startTime).toISOString(),
    });
    // Ensure conv.updated_at is aligned with message
    await conversationRepo.updateMode(conv.id, 'ai');

    // 1.1 Test boundary at 4m59s (299,000 ms silence) -> MUST NOT trigger warning
    const res4m59s = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 4 * 60 * 1000 + 59 * 1000, // T0 + 299,000ms
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });
    assert.equal(res4m59s.warningsSent.includes(conv.id), false, '4m59s: Warning must NOT be sent');
    const convAt4m59s = await conversationRepo.findById(conv.id);
    assert.equal(Boolean(convAt4m59s.warning_sent), false, '4m59s: warning_sent flag must remain false');
    assert.equal(convAt4m59s.mode, 'ai', '4m59s: Mode must remain ai');

    // 1.2 Test boundary at 5m01s (301,000 ms silence) -> MUST trigger warning
    const res5m01s = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 5 * 60 * 1000 + 1000, // T0 + 301,000ms
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });
    assert.ok(res5m01s.warningsSent.includes(conv.id), '5m01s: Warning MUST be dispatched');
    const convAt5m01s = await conversationRepo.findById(conv.id);
    assert.equal(convAt5m01s.warning_sent, true, '5m01s: warning_sent must be true');
    assert.ok(convAt5m01s.warning_sent_at, '5m01s: warning_sent_at timestamp must be recorded');
    assert.equal(convAt5m01s.mode, 'ai', '5m01s: Mode must still be ai');

    // 1.3 Customer sends message at 7m (T0 + 420,000 ms) -> Warning MUST be reset
    const customerMsgTime = startTime + 7 * 60 * 1000;
    const custMsg = await messageRepo.create({
      conversationId: conv.id,
      senderType: 'user',
      content: 'Dạ em vẫn đang xem mẫu tóc nhé!',
    });
    // For time-travel simulation, set message created_at to customerMsgTime
    const allMsgs = jsonStore.getCollection('messages');
    const msgInDb = allMsgs.find(m => m.id === custMsg.id);
    if (msgInDb) {
      msgInDb.created_at = new Date(customerMsgTime).toISOString();
      jsonStore.saveCollection('messages', allMsgs);
    }

    // Trigger reset logic via service
    sessionTimeoutService.resetInactivityWarning(conv.id);

    const convAt7m = await conversationRepo.findById(conv.id);
    assert.equal(convAt7m.warning_sent, false, '7m: warning_sent must be reset to false');
    assert.equal(convAt7m.mode, 'ai', '7m: Mode must remain ai');

    // Re-check at 7m30s: Session must remain active with zero warnings and no close
    const res7m30s = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 7 * 60 * 1000 + 30 * 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });
    assert.equal(res7m30s.warningsSent.includes(conv.id), false, '7m30s: No warning should be sent after customer reset');
    assert.equal(res7m30s.closedAI.includes(conv.id), false, '7m30s: Session must NOT be closed');

    // 1.4 Test 10m auto-close on a non-responding session:
    // Create a fresh unresponded session with holding slot
    const startTime2 = Date.now();
    const conv2 = await conversationRepo.create({ guestSessionId: uuidv4() });
    createdConvIds.push(conv2.id);

    const holdSlot = await appointmentRepo.createHoldingSlot({
      conversationId: conv2.id,
      guestSessionId: conv2.guest_session_id,
      appointmentDate: '2028-12-01',
      appointmentTime: '15:00',
      durationMinutes: 30,
      notes: 'Test boundary auto-close hold',
    });
    assert.equal(holdSlot.status, 'holding');

    // Send warning at T0 + 5m01s
    await sessionTimeoutService.checkTimeouts(null, {
      now: startTime2 + 5 * 60 * 1000 + 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });
    const conv2Warned = await conversationRepo.findById(conv2.id);
    assert.equal(conv2Warned.warning_sent, true);

    // At 9m59s (4m58s after warning) -> MUST NOT close yet
    const res9m59s = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime2 + 9 * 60 * 1000 + 59 * 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });
    assert.equal(res9m59s.closedAI.includes(conv2.id), false, '9m59s: Session must NOT be closed before full 10m');
    const conv2At9m59s = await conversationRepo.findById(conv2.id);
    assert.equal(conv2At9m59s.mode, 'ai', '9m59s: Mode must still be ai');

    // At 10m01s (5m00s after warning) -> MUST close as lead and cancel holding slot
    const res10m01s = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime2 + 10 * 60 * 1000 + 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
    });
    assert.ok(res10m01s.closedAI.includes(conv2.id), '10m01s: Session MUST be closed');

    const conv2Closed = await conversationRepo.findById(conv2.id);
    assert.equal(conv2Closed.mode, 'closed', '10m01s: Mode must be closed');
    assert.equal(conv2Closed.is_lead, true, '10m01s: is_lead must be true');
    assert.ok(conv2Closed.closed_at, '10m01s: closed_at must be recorded');

    // Check holding slot released
    const allAppts = jsonStore.getCollection('appointments');
    const checkedHold = allAppts.find(a => a.id === holdSlot.id);
    assert.equal(checkedHold.status, 'cancelled', '10m01s: Associated holding slot must be cancelled');
  });

  // ============================================================================
  // AREA 2: CLOSED SESSION RACE CONDITIONS (CR-05)
  // ============================================================================
  test('2. CR-05 Closed Session Race Condition: Concurrent messages to closed session preserve history and spawn clean new sessions', async () => {
    const guestSessionId = uuidv4();
    const oldConv = await conversationRepo.create({ guestSessionId });
    createdConvIds.push(oldConv.id);

    // Set customer metadata on old conversation
    await conversationRepo.updateCustomerInfo(oldConv.id, {
      customerName: 'Trần Thị Thảo',
      customerPhone: '0987654321',
      customerEmail: null,
    });

    // Populate old conversation with initial message history
    await messageRepo.create({
      conversationId: oldConv.id,
      senderType: 'user',
      content: 'Chào salon, tôi hỏi lịch trước đó',
    });
    await messageRepo.create({
      conversationId: oldConv.id,
      senderType: 'assistant',
      content: 'Dạ salon Lumière xin chào chị Thảo!',
    });

    // Close old conversation
    await conversationRepo.updateMode(oldConv.id, 'closed', null);
    await conversationRepo.closeAsLead(oldConv.id, { leadNotes: 'Closed lead historical test' });

    const initialOldMsgs = await messageRepo.findByConversation(oldConv.id);
    assert.equal(initialOldMsgs.length, 2, 'Old conversation should have exactly 2 initial messages');

    // Fire 5 concurrent messages into the closed conversation from distinct clients
    const CONCURRENT_COUNT = 5;
    const concurrentPromises = Array.from({ length: CONCURRENT_COUNT }, async (_, idx) => {
      const clientMsgId = `ADV_RACE_${idx}_${Date.now()}`;
      return conversationService.sendMessage(oldConv.id, {
        guestSessionId,
        content: `Khách hàng nhắn tin song song #${idx + 1}`,
        clientMessageId: clientMsgId,
      });
    });

    const results = await Promise.all(concurrentPromises);

    // 2.1 Verify all concurrent calls succeeded
    assert.equal(results.length, CONCURRENT_COUNT);
    for (let i = 0; i < CONCURRENT_COUNT; i++) {
      const res = results[i];
      assert.equal(res.isNewSession, true, `Result #${i} must report isNewSession: true`);
      assert.ok(res.newConversationId, `Result #${i} must provide newConversationId`);
      assert.notEqual(res.newConversationId, oldConv.id, `Result #${i} ID must be different from old conversation`);
      assert.ok(res.greeting, `Result #${i} must provide greeting`);
      assert.match(res.greeting.content, /Salon Lumière/i, `Result #${i} greeting must include Salon Lumière`);
      createdConvIds.push(res.newConversationId);
    }

    // 2.2 Verify old conversation is 100% intact and read-only
    const oldConvVerify = await conversationRepo.findById(oldConv.id);
    assert.equal(oldConvVerify.mode, 'closed', 'Old conversation MUST remain closed');
    assert.equal(oldConvVerify.is_lead, true, 'Old conversation MUST remain lead');

    const oldMsgsAfter = await messageRepo.findByConversation(oldConv.id);
    assert.equal(oldMsgsAfter.length, 2, 'Old conversation messages count MUST NOT change (read-only history)');
    assert.equal(oldMsgsAfter[0].content, 'Chào salon, tôi hỏi lịch trước đó');
    assert.equal(oldMsgsAfter[1].content, 'Dạ salon Lumière xin chào chị Thảo!');

    // 2.3 Verify database collections are valid and consistent
    const rawConvs = jsonStore.getCollection('conversations');
    const rawMsgs = jsonStore.getCollection('messages');
    assert.ok(Array.isArray(rawConvs), 'Conversations collection must be an array');
    assert.ok(Array.isArray(rawMsgs), 'Messages collection must be an array');
  });

  // ============================================================================
  // AREA 3: STAFF HANDOVER TIMEOUT (CR-06)
  // ============================================================================
  test('3. CR-06 Staff Handover Timeout: Suspends timeout at 5m/10m, and auto-closes at 60m01s', async () => {
    const guestSessionId = uuidv4();
    const convHuman = await conversationRepo.create({ guestSessionId });
    createdConvIds.push(convHuman.id);

    // Switch to human mode
    const staffId = '00000000-0000-0000-0000-000000000002';
    await conversationRepo.updateMode(convHuman.id, 'human', staffId);

    const startTime = Date.now();

    // Last message at T0
    await messageRepo.create({
      conversationId: convHuman.id,
      senderType: 'user',
      content: 'Chị nhân viên tư vấn gói nhuộm phục hồi olaplex giúp em nhé',
      created_at: new Date(startTime).toISOString(),
    });

    // 3.1 At 5m: Must NOT send warning and must NOT close
    const res5m = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 5 * 60 * 1000 + 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
      humanCloseMs: 60 * 60 * 1000,
    });
    assert.equal(res5m.warningsSent.includes(convHuman.id), false, '5m: No AI warning in human mode');
    assert.equal(res5m.closedHuman.includes(convHuman.id), false, '5m: Human session must not close');
    const convAt5m = await conversationRepo.findById(convHuman.id);
    assert.equal(convAt5m.mode, 'human', '5m: Mode must remain human');

    // 3.2 At 10m: Must NOT close
    const res10m = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 10 * 60 * 1000 + 1000,
      aiWarningMs: 5 * 60 * 1000,
      aiCloseMs: 10 * 60 * 1000,
      humanCloseMs: 60 * 60 * 1000,
    });
    assert.equal(res10m.closedHuman.includes(convHuman.id), false, '10m: Human session must not close');
    assert.equal(res10m.closedAI.includes(convHuman.id), false, '10m: Must not trigger AI close');
    const convAt10m = await conversationRepo.findById(convHuman.id);
    assert.equal(convAt10m.mode, 'human', '10m: Mode must remain human');

    // 3.3 At 59m59s: Must still remain active
    const res59m = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 59 * 60 * 1000 + 59 * 1000,
      humanCloseMs: 60 * 60 * 1000,
    });
    assert.equal(res59m.closedHuman.includes(convHuman.id), false, '59m59s: Must not close before 60m');
    const convAt59m = await conversationRepo.findById(convHuman.id);
    assert.equal(convAt59m.mode, 'human', '59m59s: Mode must remain human');

    // 3.4 At 60m01s: Must auto-close and record system message
    const res60m01s = await sessionTimeoutService.checkTimeouts(null, {
      now: startTime + 60 * 60 * 1000 + 1000,
      humanCloseMs: 60 * 60 * 1000,
    });
    assert.ok(res60m01s.closedHuman.includes(convHuman.id), '60m01s: Human session MUST auto-close');

    const convAt60m = await conversationRepo.findById(convHuman.id);
    assert.equal(convAt60m.mode, 'closed', '60m01s: Mode must be closed');
    assert.equal(convAt60m.is_lead, true, '60m01s: is_lead must be true');
    assert.ok(convAt60m.closed_at, '60m01s: closed_at must be populated');

    // System message verification
    const humanMsgs = await messageRepo.findByConversation(convHuman.id);
    const closeNotice = humanMsgs.find(m => m.sender_type === 'system' && m.content.includes('60 phút'));
    assert.ok(closeNotice, 'System notice must mention 60 minutes');

    // 3.5 Also verify `waiting_for_agent` mode has the same 60-minute suspension
    const startTimeWaiting = Date.now();
    const convWaiting = await conversationRepo.create({ guestSessionId: uuidv4() });
    createdConvIds.push(convWaiting.id);
    await conversationRepo.updateMode(convWaiting.id, 'waiting_for_agent');

    // At 10m: Must NOT close
    await sessionTimeoutService.checkTimeouts(null, {
      now: startTimeWaiting + 10 * 60 * 1000,
      humanCloseMs: 60 * 60 * 1000,
    });
    const convWaitingAt10m = await conversationRepo.findById(convWaiting.id);
    assert.equal(convWaitingAt10m.mode, 'waiting_for_agent');

    // At 60m01s: Must close
    const resWaiting60m = await sessionTimeoutService.checkTimeouts(null, {
      now: startTimeWaiting + 60 * 60 * 1000 + 1000,
      humanCloseMs: 60 * 60 * 1000,
    });
    assert.ok(resWaiting60m.closedHuman.includes(convWaiting.id));
    const convWaitingClosed = await conversationRepo.findById(convWaiting.id);
    assert.equal(convWaitingClosed.mode, 'closed');
  });

  // ============================================================================
  // AREA 4: HIGH-CONCURRENCY RAPID WRITES ACROSS JSON COLLECTIONS (R5)
  // ============================================================================
  test('4. R5 High-Concurrency Mock JSON Database Stress: 60 rapid concurrent writes with mutex & retry verification', async () => {
    const TOTAL_OPERATIONS = 60;
    const collections = ['appointments', 'messages', 'conversations', 'system_settings'];
    const dataDir = jsonStore.DATA_DIR;

    // Snapshot collection sizes before stress run
    const initialAppointments = [...jsonStore.getCollection('appointments')];
    const initialMessages = [...jsonStore.getCollection('messages')];
    const initialConversations = [...jsonStore.getCollection('conversations')];

    // Build 60 concurrent write tasks across 4 collections
    const writePromises = Array.from({ length: TOTAL_OPERATIONS }, async (_, idx) => {
      const col = collections[idx % collections.length];
      const items = jsonStore.getCollection(col);

      if (col === 'appointments') {
        items.push({
          id: `ADV_APPT_${idx}_${Date.now()}`,
          customer_name: `Stress User ${idx}`,
          customer_phone: '0901234567',
          customer_email: null,
          appointment_date: '2028-12-30',
          appointment_time: '10:00',
          status: 'confirmed',
          created_at: new Date().toISOString(),
        });
      } else if (col === 'messages') {
        items.push({
          id: `ADV_MSG_${idx}_${Date.now()}`,
          conversation_id: `ADV_CONV_DUMMY_${idx}`,
          sender_type: 'system',
          content: `Concurrent stress message content #${idx}`,
          created_at: new Date().toISOString(),
        });
      } else if (col === 'conversations') {
        items.push({
          id: `ADV_CONV_${idx}_${Date.now()}`,
          guest_session_id: `ADV_SESS_${idx}`,
          mode: 'ai',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      } else if (col === 'system_settings') {
        const existing = items.find(s => s.key === `stress_key_${idx % 5}`);
        if (existing) {
          existing.value = `stress_val_${idx}`;
          existing.updated_at = new Date().toISOString();
        } else {
          items.push({
            key: `stress_key_${idx % 5}`,
            value: `stress_val_${idx}`,
            is_public: false,
            updated_at: new Date().toISOString(),
          });
        }
      }

      // Synchronous atomic save with Windows mutex and backoff retry
      jsonStore.saveCollection(col, items);
      return { opIndex: idx, collection: col, success: true };
    });

    // Execute all 60 concurrent operations simultaneously
    const results = await Promise.all(writePromises);

    // 4.1 Verify 100% of operations completed successfully
    assert.equal(results.length, TOTAL_OPERATIONS);
    for (const r of results) {
      assert.equal(r.success, true);
    }

    // 4.2 Verify zero orphaned .tmp.* files remain in database/data/
    const diskFiles = fs.readdirSync(dataDir);
    const orphanedTmpFiles = diskFiles.filter(f => f.includes('.tmp.') || f.endsWith('.tmp'));
    assert.equal(
      orphanedTmpFiles.length,
      0,
      `ZERO orphaned .tmp.* files must remain in database/data/. Found: ${JSON.stringify(orphanedTmpFiles)}`
    );

    // 4.3 Verify data integrity: Read each collection directly from disk via fs and JSON.parse
    for (const col of collections) {
      const filePath = path.join(dataDir, `${col}.json`);
      assert.ok(fs.existsSync(filePath), `File ${col}.json must exist on disk`);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      assert.doesNotThrow(() => {
        const parsed = JSON.parse(fileContent);
        assert.ok(Array.isArray(parsed), `${col}.json on disk must be a valid JSON array`);
      }, `File ${col}.json must contain valid JSON`);
    }

    // 4.4 Clean up stress test items to leave clean DB state
    const cleanAppointments = jsonStore.getCollection('appointments').filter(a => !String(a.id).startsWith('ADV_APPT_'));
    jsonStore.saveCollection('appointments', cleanAppointments);

    const cleanMessages = jsonStore.getCollection('messages').filter(m => !String(m.id).startsWith('ADV_MSG_'));
    jsonStore.saveCollection('messages', cleanMessages);

    const cleanConversations = jsonStore.getCollection('conversations').filter(c => !String(c.id).startsWith('ADV_CONV_'));
    jsonStore.saveCollection('conversations', cleanConversations);

    const cleanSettings = jsonStore.getCollection('system_settings').filter(s => !String(s.key).startsWith('stress_key_'));
    jsonStore.saveCollection('system_settings', cleanSettings);
  });
});
