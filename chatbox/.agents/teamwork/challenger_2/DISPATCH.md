# Dispatch — Challenger 2: Session Lifecycle & Mock DB Concurrency Adversarial Verification

## Mission
Empirically stress-test and challenge the correctness and robustness of CR-04, CR-05, CR-06, and R5:
1. Two-stage timeout boundary stress:
   - Exactly at 4m59s: verify NO warning sent.
   - At 5m01s: verify warning message is sent and `warning_sent = true`.
   - Customer message at 7m: verify warning is reset (`warning_sent = false`) and session remains active.
   - At 10m01s of silence: verify session is closed (`mode = 'closed'`).
2. Closed Session Race Condition:
   - Fire 5 concurrent messages into a closed conversation from multiple connections simultaneously. Verify that old conversation remains intact/read-only, new session is created cleanly without corrupting conversation history.
3. Staff Handover Timeout:
   - At 5m and 10m: verify NO timeout or closing occurs in `human` mode.
   - At 60m01s: verify auto-close occurs.
4. Mock JSON Database High-Concurrency Stress:
   - Fire 50 rapid concurrent write operations across multiple collections in `jsonStore.js`.
   - Verify that all data writes succeed, zero `EPERM`/`EBUSY` crashes occur, and zero orphaned `.tmp.*` files remain in `database/data/`.
5. Provide empirical test scripts and record verdict: **APPROVE** or **REQUEST_CHANGES**.


## 2026-10-30T08:05:07Z
You are challenger_2. Your working directory is d:\projects\chatbox\.agents\teamwork\challenger_2.
Your parent orchestrator is conversation ID 268096b1-4ea4-4135-bf9f-c4f8c0abc985.

MANDATORY FIRST STEPS:
1. Read d:\projects\chatbox\.agents\teamwork\ORIGINAL_REQUEST.md before starting any work.
2. Read d:\projects\chatbox\.agents\teamwork\challenger_2\DISPATCH.md.
3. Read d:\projects\chatbox\.agents\teamwork\orchestrator\PROJECT.md.
4. Initialize your BRIEFING.md and progress.md in your working directory.

TASK:
Adversarially stress-test CR-04, CR-05, CR-06, and R5:
- 2-stage timeout boundary tests (4m59s vs 5m01s, customer message reset, 10m close).
- Concurrent messages to closed session from multiple clients.
- Staff handover timeout suspension at 5m/10m and auto-close at 60m.
- High-concurrency rapid writes (50+ operations) across JSON collections to test Windows mutex and retry backoff.
- Provide empirical verification results and verdict: **APPROVE** or **REQUEST_CHANGES**.
- Write handoff.md and send completion message to orchestrator.
