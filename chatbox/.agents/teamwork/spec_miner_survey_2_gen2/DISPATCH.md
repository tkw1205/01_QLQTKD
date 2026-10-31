# Dispatch — spec_miner_survey_2_gen2

## Task
Perform exhaustive test suite and verification analysis across:
- `tests/` directory (all test files, e.g., `booking_process_salons.test.js`, etc.)
- `package.json` test scripts

## Objectives
1. Map all existing test cases:
   - What tests currently exist and what each test asserts.
   - Run tests if needed via worker/test runner commands (or analyze test definitions).
   - Identify where 10-minute holding slot TTL is hardcoded or checked in tests (e.g. `booking_process_salons.test.js`).
   - Identify gaps against CR-01, CR-02, CR-03, CR-04, CR-05, CR-06.
   - Identify gaps against AC-01 through AC-20.
2. Produce `test_inventory.md` in your working directory listing current test coverage, failing/outdated tests, and exact test expansion plan for 100% pass rate.
3. Write `handoff.md` following the 5-component protocol and send message to orchestrator.

## 2026-10-30T07:04:27Z
You are spec_miner_survey_2_gen2. Your working directory is d:\projects\chatbox\.agents\teamwork\spec_miner_survey_2_gen2.
Your parent orchestrator is conversation ID 268096b1-4ea4-4135-bf9f-c4f8c0abc985.

MANDATORY FIRST STEPS:
1. Read d:\projects\chatbox\.agents\teamwork\ORIGINAL_REQUEST.md before starting any work.
2. Read d:\projects\chatbox\.agents\teamwork\spec_miner_survey_2_gen2\DISPATCH.md.
3. Initialize your BRIEFING.md and progress.md in your working directory.

INTEGRITY RULES (Benchmark mode):
The team must NOT: sao chép mã nguồn từ các dự án mã nguồn mở có sẵn cho logic cốt lõi, sử dụng thư viện hoặc framework có sẵn cho chức năng cốt lõi, chạy script bên ngoài hoặc ủy quyền thực thi cho công cụ khác.
As a spec miner / test analyst, you are read-only. Do not write or modify any application source code.

ASSIGNMENT:
Analyze the entire test suite in tests/ and package.json:
- Map all existing test files, test suites, and individual test cases.
- Analyze where 10-minute holding slot TTL is currently tested or hardcoded (specifically booking_process_salons.test.js or others).
- Analyze existing tests for booking validation, email requirement, appointment lookup.
- Analyze test coverage (or lack thereof) for chat session lifecycle, 5-min warning, 10-min closed, 60-min staff handover, session read-only and new session on customer return.
- Analyze AC-01 through AC-20 coverage in existing tests and identify what tests currently pass, what fail, and what are missing.
- Formulate a clear test matrix for 100% test pass rate covering CR-01..CR-06 and AC-01..AC-20.

OUTPUT REQUIREMENTS:
- Write test_inventory.md to d:\projects\chatbox\.agents\teamwork\spec_miner_survey_2_gen2\test_inventory.md.
- Write handoff.md in your working directory adhering to the 5-component protocol: Observation, Logic Chain, Caveats, Conclusion, Verification Method.
- Send a message to parent orchestrator (268096b1-4ea4-4135-bf9f-c4f8c0abc985) informing that your report is ready with the file path.
