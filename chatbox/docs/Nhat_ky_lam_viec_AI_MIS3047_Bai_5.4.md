# Nhật ký làm việc với AI — MIS3047, Bài 5.4

## 1. Thông tin dự án

- **Tên dự án:** Nền tảng Chatbox Tư vấn Sản phẩm & Đặt Lịch Tự Động (AI + Nhân Viên), với luồng nghiệp vụ đặt lịch cho salon.
- **Mô tả:** Website hỗ trợ khách tìm hiểu dịch vụ, trò chuyện với AI hoặc nhân viên và đặt lịch. Backend dùng Node.js/Express cùng kho dữ liệu JSON cục bộ; các yêu cầu được ghi lại gồm đặt lịch, giữ slot, hội thoại và quản lý phiên.
- **Nhóm/sinh viên:** [CẦN TÔI BỔ SUNG: tên nhóm và thành viên]
- **Công cụ AI:** Hồ sơ repo lưu các vai trò `orchestrator`, `worker`, `reviewer`, `challenger`; tên sản phẩm/model AI thực tế: [CẦN TÔI BỔ SUNG]
- **Khoảng thời gian bằng chứng:** 29/10/2026–02/11/2026. Ngày lấy theo hồ sơ tác vụ/commit.
- **Phạm vi bản nháp:** Các lượt dưới đây được chọn từ prompt/handoff lưu trong repo và kết quả kiểm thử được ghi lại. Chỗ không có prompt nguyên văn hoặc đánh giá cá nhân được đánh dấu để bổ sung; không suy diễn thành lời kể của sinh viên.

## 2. Bảng tổng quan

| STT | Ngày | Nhiệm vụ | Kết quả | Mẫu thất bại |
|---:|---|---|---|---|
| 1 | 30/10–31/10 | Triển khai nhóm yêu cầu đặt lịch và phiên chat | Thất bại một phần: báo cáo kiểm thử xanh nhưng sau đó có lỗi chatbot được ghi nhận | F3 — Chấp nhận mù |
| 2 | 30/10 | Email không bắt buộc và tra cứu lịch | Handoff ghi 4/4 kiểm thử đạt | — |
| 3 | 30/10 | TTL giữ chỗ 5 phút | Cơ bản hoàn thành; review sau đó tìm thấy lỗi còn sót | — |
| 4 | 30/10 | Timeout hai giai đoạn và phiên chat mới | Handoff ghi 5/5 kiểm thử hội thoại đạt | — |
| 5 | 30/10 | Ổn định JSON store và mở rộng kiểm thử | Handoff ghi 119/119 kiểm thử đạt | — |
| 6 | 30/10 | Xử lý sự cố trong bộ kiểm thử | Có xung đột dữ liệu, phụ thuộc dịch vụ ngoài và test treo; sau đó được điều chỉnh | F10 — Nợ kỹ thuật vô hình |
| 7 | 30/10 | Review adversarial sau lượt test xanh | Phát hiện thông báo TTL sai và nhánh xử lý hết hạn bị che | F3 — Chấp nhận mù |
| 8 | 30/10 | Sửa các lỗi review và lỗi quota provider | Handoff sau sửa ghi 140 test và 17 test adversarial đạt | — |
| 9 | 31/10 | Điều tra/sửa lỗi chọn giờ và ngữ cảnh chatbot | Báo cáo lỗi liệt kê 6 vấn đề; báo cáo test ghi 22/22 đạt sau sửa | — |
| 10 | 31/10 | Cải thiện website khách hàng và tài khoản | Giao diện được cập nhật nhưng báo cáo còn 4 assertion chưa đạt, một số luồng chưa kiểm thử | F11 — Mắc kẹt ở "vòng 70%" |

## 3. Nhật ký chi tiết

### Lượt 1 — Triển khai yêu cầu đặt lịch và chat theo nhiều nhóm · 30/10–31/10/2026 · Thất bại một phần

- **Bối cảnh & mục tiêu:** Chia yêu cầu đặt lịch salon thành các nhánh song song, gồm email tùy chọn, TTL giữ slot, vòng đời phiên chat, độ ổn định JSON và kiểm thử. Các hồ sơ ban đầu báo hoàn thành; tài liệu điều tra ngày 31/10 sau đó ghi nhận các lỗi chọn giờ và duy trì ngữ cảnh.
- **Prompt đã dùng:** Trích nguyên văn từ [ORIGINAL_REQUEST.md](../.agents/teamwork/ORIGINAL_REQUEST.md):
  > “Phân chia các nhóm task song song cho các worker/reviewer để kiểm tra, phân tích và triển khai cho dự án website đặt lịch salon và chatbox AI vận hành thực tế (production) dựa trên `docs/spec/business_spec_booking.md`, `docs/spec/Câu-trả-lời.docx`, `docs/spec/phieu_lam_ro_change_request.md` và kế thừa kiểm tra trạng thái từ session trước tại `.agents/teamwork/`.”
- **Kết quả AI trả về:** Hồ sơ điều phối báo các yêu cầu đã hoàn thành và kiểm thử đạt; tuy nhiên, báo cáo điều tra tiếp theo liệt kê sáu lỗi chatbot, gồm nhận diện sai ý định chọn giờ, mất context, không lưu giờ đã chọn và nội dung sai vai trò. Bằng chứng: `26dfaef`, `a5a6860:chatbox/BUG_REPORT.md` và `a5a6860:chatbox/TEST_REPORT.md`.
- **Đánh giá của tôi:** [CẦN TÔI BỔ SUNG: Tôi có dựa vào báo cáo test xanh để chấp nhận kết quả không? Tôi đã đọc diff/chạy thử hội thoại thật chưa?]
- **Điều chỉnh:** Sau khi các lỗi được ghi nhận, hồ sơ có báo cáo nguyên nhân gốc và bộ kiểm thử tình huống chọn giờ/ngữ cảnh; báo cáo test ghi 22/22 đạt sau sửa. Tôi cần xác nhận đây có đúng là điều chỉnh tôi đã yêu cầu/thực hiện không.
- **Bài học:** Kết quả test xanh chỉ có giá trị trong phạm vi tình huống mà test thực sự bao phủ.
- **Mẫu thất bại:** **F3 Chấp nhận mù**
- **Dấu hiệu nhận biết:** Có báo cáo hoàn thành/test xanh trước khi tài liệu khác ghi nhận lỗi ở luồng hội thoại thực tế.
- **Nguyên nhân gốc:** Theo báo cáo lỗi, các tình huống chọn giờ, lưu booking state và phản hồi theo vai trò chưa được bao phủ đầy đủ; nguyên nhân không thể quy về “AI sai” chung chung.
- **Biện pháp phòng tránh áp dụng sau đó:** Bổ sung test theo hội thoại nhiều lượt và kiểm tra trạng thái đặt lịch; [CẦN TÔI BỔ SUNG: xác nhận đây là biện pháp tôi đã áp dụng hay chỉ là thay đổi có trong repo].

### Lượt 2 — Email tùy chọn và tra cứu lịch bằng mã đặt chỗ · 30/10/2026 · Thành công

- **Bối cảnh & mục tiêu:** Cho phép đặt lịch không cần email và tra cứu lịch bằng số điện thoại cùng booking code, không phụ thuộc phiên trình duyệt cũ.
- **Prompt đã dùng:** Trích nguyên văn từ [worker_m1/DISPATCH.md](../.agents/teamwork/worker_m1/DISPATCH.md):
  > “Implement CR-01:
  > 1. Optional Email on Web booking form and API:
  >    - Accept null/empty email in `src/routes/appointments.js` and `src/services/appointmentService.js`.
  >    - Update `public/appointments.html` and `public/js/appointments.js` so email is optional (label with "(Không bắt buộc)").”
- **Kết quả AI trả về:** Handoff M1 ghi nhận email rỗng được chuẩn hóa, endpoint tra cứu được bổ sung và kiểm thử `appointments.test.js` đạt 4/4. Đây là kết quả được báo trong handoff, không phải kết quả tôi tự chạy lại trong lần biên tập này.
- **Đánh giá của tôi:** [CẦN TÔI BỔ SUNG: Tôi đã kiểm tra UI/API và diff nào?]
- **Điều chỉnh:** [CẦN TÔI BỔ SUNG: Có chỉnh prompt hoặc yêu cầu gì sau kết quả đầu tiên không?]
- **Bài học:** Nêu rõ trường dữ liệu bắt buộc/tùy chọn và cách tra cứu giúp yêu cầu kiểm thử được cụ thể hơn.

### Lượt 3 — TTL giữ slot 5 phút · 30/10/2026 · Thành công nhưng phải sửa

- **Bối cảnh & mục tiêu:** Đồng bộ thời hạn giữ lịch từ 10 phút xuống 5 phút trong repository, AI tools và prompt hệ thống; cho phép email tùy chọn.
- **Prompt đã dùng:** Trích nguyên văn từ [worker_m2/DISPATCH.md](../.agents/teamwork/worker_m2/DISPATCH.md):
  > “Implement CR-02 and CR-03:
  > 1. Holding Slot TTL 5 minutes:
  >    - In `src/repositories/appointmentRepository.js`:
  >      - Update line 7: `const HOLD_DURATION_MS = 5 * 60 * 1000; // 5 minutes TTL`”
- **Kết quả AI trả về:** Handoff M2 ghi TTL 300.000 ms, tự giải phóng slot và cập nhật mô tả AI. Review sau đó vẫn phát hiện chuỗi thông báo “10 phút” và lỗi thứ tự xử lý khi slot hết hạn. Bằng chứng: [worker_m2/handoff.md](../.agents/teamwork/worker_m2/handoff.md), [orchestrator/handoff.md](../.agents/teamwork/orchestrator/handoff.md), commit `a5a6860`.
- **Đánh giá của tôi:** [CẦN TÔI BỔ SUNG: Tôi có đọc toàn bộ diff tìm chuỗi 10 phút và chạy test hết hạn không?]
- **Điều chỉnh:** Các lỗi review được giao sửa ở lượt 8; handoff remediation ghi phản hồi API và nhánh hết hạn được cập nhật.
- **Bài học:** Thay đổi một quy tắc nghiệp vụ cần được rà soát trên mọi bề mặt: API, AI tools, prompt, thông báo và test.

### Lượt 4 — Timeout phiên chat hai giai đoạn · 30/10/2026 · Thành công

- **Bối cảnh & mục tiêu:** Sau 5 phút im lặng cảnh báo khách, sau tổng 10 phút đóng phiên; tin nhắn mới tạo phiên mới; phiên nhân viên dùng timeout 60 phút.
- **Prompt đã dùng:** Trích nguyên văn từ [worker_m3/DISPATCH.md](../.agents/teamwork/worker_m3/DISPATCH.md):
  > “Implement CR-04, CR-05, and CR-06:
  > 1. Two-stage chat session timeout (CR-04):
  >    - Total timeout is 10 minutes.
  >    - Stage 1: After 5 minutes of customer silence/inactivity in AI mode (`mode === 'ai'`), send warning message”
- **Kết quả AI trả về:** Handoff M3 ghi service timeout, tạo phiên mới khi khách nhắn lại phiên đã đóng, và timeout 60 phút cho nhân viên; `tests/conversations.test.js` được báo cáo đạt 5/5.
- **Đánh giá của tôi:** [CẦN TÔI BỔ SUNG: Tôi có kiểm tra hành vi Socket.IO/UI hay chỉ dựa vào test?]
- **Điều chỉnh:** Hồ sơ ghi test dùng thời gian mô phỏng để kiểm tra timeout; không có prompt điều chỉnh riêng được lưu.
- **Bài học:** Dùng thời gian mô phỏng giúp kiểm thử timeout nhanh và ít phụ thuộc thời gian thực.

### Lượt 5 — Ổn định JSON store và mở rộng kiểm thử · 30/10/2026 · Thành công

- **Bối cảnh & mục tiêu:** Tránh tranh chấp khi ghi JSON, lỗi rename trên Windows và đảm bảo bộ test chạy hết.
- **Prompt đã dùng:** Trích nguyên văn từ [worker_m4/DISPATCH.md](../.agents/teamwork/worker_m4/DISPATCH.md):
  > “Implement R4, R5, and ensure 100% test pass across all acceptance criteria (CR-01..CR-06 and AC-01..AC-20):”
- **Kết quả AI trả về:** Handoff ghi mutex theo collection, retry rename, dọn file tạm, chạy test tuần tự và bổ sung test vòng đời phiên/tra cứu. Kết quả cuối được ghi là 119/119 test trên 20 suite đạt; xem [worker_m4/handoff.md](../.agents/teamwork/worker_m4/handoff.md).
- **Đánh giá của tôi:** [CẦN TÔI BỔ SUNG: Tôi đã kiểm tra phương án mutex và xác nhận giới hạn chạy một tiến trình chưa?]
- **Điều chỉnh:** Báo cáo có xử lý riêng các test cần độc lập dữ liệu, ngày động và dịch vụ AI ngoại tuyến.
- **Bài học:** Với kho JSON dùng chung, tính cô lập của test và tính nguyên tử khi ghi dữ liệu phải được kiểm tra cùng nhau.

### Lượt 6 — Sửa lỗi phát sinh trong bộ test · 30/10/2026 · Thất bại một phần

- **Bối cảnh & mục tiêu:** Khi chạy yêu cầu toàn bộ test, các giả định cũ về TTL, dữ liệu test, dịch vụ Ollama và đóng server gây lỗi hoặc treo.
- **Prompt đã dùng:** Prompt M4 được lưu nguyên văn ở [worker_m4/DISPATCH.md](../.agents/teamwork/worker_m4/DISPATCH.md), trong đó yêu cầu:
  > “Run `npm test` and verify that 100% of test suites pass with 0 failures!”
- **Kết quả AI trả về:** Handoff ghi test cũ vẫn kỳ vọng TTL 10 phút; một test đụng slot 10:30 do dữ liệu dùng chung; một test dùng ngày quá khứ; Ollama ngoại tuyến trả `ECONNREFUSED`; server test mở làm tiến trình treo. Sau điều chỉnh, handoff ghi 119/119 đạt.
- **Đánh giá của tôi:** [CẦN TÔI BỔ SUNG: Tôi đã trực tiếp thấy lỗi nào, đọc log nào và có tự xác nhận kết quả sau sửa không?]
- **Điều chỉnh:** Handoff ghi test runner chuyển sang tuần tự, dọn dữ liệu, dùng ngày tương lai động, fallback khi Ollama offline và đóng server sau test. [CẦN TÔI BỔ SUNG: xác nhận các điều chỉnh này do tôi yêu cầu/duyệt.]
- **Bài học:** Test dựa trên dịch vụ ngoài và dữ liệu dùng chung cần được cô lập hoặc giả lập để kết quả ổn định.
- **Mẫu thất bại:** **F10 Nợ kỹ thuật vô hình**
- **Dấu hiệu nhận biết:** Các vấn đề tiềm ẩn trong test runner, dữ liệu dùng chung, ngày cố định và dịch vụ ngoại tuyến chỉ lộ ra khi chạy toàn bộ suite.
- **Nguyên nhân gốc:** Handoff xác định test chạy song song trên một kho JSON chung; một số fixture đã cũ/phụ thuộc môi trường và server test chưa được đóng.
- **Biện pháp phòng tránh áp dụng sau đó:** Chạy tuần tự, dùng dữ liệu/ngày độc lập, kiểm tra fallback ngoại tuyến và đóng tài nguyên sau test; cần xác nhận việc áp dụng thực tế.

### Lượt 7 — Review phát hiện lỗi sau khi test xanh · 30/10/2026 · Thất bại một phần

- **Bối cảnh & mục tiêu:** Kiểm tra adversarial sau khi bộ test tổng thể được báo cáo đạt, tập trung vào việc giữ slot và thời hạn 5 phút.
- **Prompt đã dùng:** [TÔI CẦN BỔ SUNG PROMPT GỐC]. Handoff điều phối chỉ lưu kết quả review, không lưu nguyên văn yêu cầu gửi Reviewer/Challenger.
- **Kết quả AI trả về:** Handoff ghi review phát hiện phản hồi API còn nói “10 phút” và nhánh kiểm tra hết hạn trong `confirmHold()` bị cleanup chạy trước làm nhánh lỗi 410 không tới được. Bằng chứng tại [orchestrator/handoff.md](../.agents/teamwork/orchestrator/handoff.md).
- **Đánh giá của tôi:** [CẦN TÔI BỔ SUNG: Tôi đã dựa vào bộ test xanh trước review như thế nào?]
- **Điều chỉnh:** Các phát hiện được chuyển thành nhiệm vụ remediation ở lượt tiếp theo.
- **Bài học:** Test tổng thể đạt không thay thế review các nhánh lỗi và thông báo ở cấp nghiệp vụ.
- **Mẫu thất bại:** **F3 Chấp nhận mù**
- **Dấu hiệu nhận biết:** Báo cáo test đạt trước đó chưa phát hiện hai hành vi sai được reviewer tái kiểm tra.
- **Nguyên nhân gốc:** Theo handoff, test chưa bắt được phản hồi TTL không nhất quán và thứ tự xử lý expiration; đây là thiếu xác minh đúng nhánh, không phải bằng chứng rằng không hề chạy test.
- **Biện pháp phòng tránh áp dụng sau đó:** Bổ sung adversarial test cho slot hết hạn và kiểm tra thông báo trên API; [CẦN TÔI BỔ SUNG: xác nhận tôi có áp dụng/đọc các test này.]

### Lượt 8 — Remediation lỗi review và Gemini quota · 30/10/2026 · Thành công

- **Bối cảnh & mục tiêu:** Sửa đúng các phát hiện Reviewer 1/Challenger 1 về thông báo TTL, lỗi hết hạn bị che và test provider phụ thuộc quota.
- **Prompt đã dùng:** Trích nguyên văn từ [worker_remediation/DISPATCH.md](../.agents/teamwork/worker_remediation/DISPATCH.md):
  > “Address the exact findings reported by Reviewer 1 and Challenger 1:”
- **Kết quả AI trả về:** Handoff điều phối ghi thông báo đổi sang 5 phút, `confirmHold()` trả lỗi 410 cùng dữ liệu giữ lại, test Gemini có fallback khi quota/network lỗi; kết quả được ghi là 17/17 adversarial và 140/140 test đạt.
- **Đánh giá của tôi:** [CẦN TÔI BỔ SUNG: Tôi có kiểm tra diff/test sau remediation không?]
- **Điều chỉnh:** Tập trung vào các finding cụ thể thay vì yêu cầu chung “sửa cho đúng”; đây là cách làm được phản ánh trong prompt remediation.
- **Bài học:** Phản hồi review có vị trí lỗi, hành vi mong đợi và test xác nhận giúp sửa có mục tiêu.

### Lượt 9 — Chẩn đoán lỗi chọn giờ và conversation context · 31/10/2026 · Thành công sau sửa

- **Bối cảnh & mục tiêu:** Sửa hành vi chatbot đặt lịch khi khách chọn/đổi giờ, duy trì context và trả lời đúng vai trò.
- **Prompt đã dùng:** Toàn văn prompt do bạn cung cấp được giữ nguyên dưới đây:

  ```text
  # PROMPT ĐIỀU TRA, CHUẨN HÓA SYSTEM PROMPT VÀ FIX BUG CHATBOT AI SALON

  ## I. MỤC TIÊU
  Điều tra và sửa các lỗi chatbot AI tại trang chủ Salon dựa trên log hội thoại thực tế.

  Đồng thời, rà soát và chuẩn hóa System Prompt theo cấu trúc 6 thành phần:

  1. Vai trò (Role).
  2. Phạm vi (Scope).
  3. Quy tắc nghiệp vụ (Business Rules).
  4. Định dạng đầu ra (Output Format).
  5. Xử lý khi không chắc chắn (Uncertainty).
  6. Giới hạn (Constraints).
  Mục tiêu là giúp AI nhận diện đúng ý định khách hàng, tư vấn đúng dịch vụ, quản lý trạng thái hội thoại và thực hiện quy trình đặt lịch nhất quán.

  ## II. QUY TRÌNH THỰC HIỆN
  Thực hiện theo đúng thứ tự:

  1. Đọc và phân tích log hội thoại.
  2. Kiểm tra source code và System Prompt hiện tại.
  3. Điều tra nguyên nhân gốc rễ của từng bug.
  4. Lập báo cáo bug và kế hoạch sửa.
  5. Chuẩn hóa System Prompt theo cấu trúc 6 thành phần.
  6. Tiến hành sửa code và prompt sau khi hoàn thành điều tra.
  7. Viết test và chạy kiểm thử.
  8. Báo cáo kết quả.
  Không được sửa code ngay khi chưa xác định nguyên nhân gốc rễ.

  ---

  ## III. CÁC BUG CẦN ĐIỀU TRA

  ### BUG 1: Nhận diện sai ý định khách hàng
  Ví dụ:

  Khách: "Tôi muốn cắt tóc".

  AI tự động hỏi ngày giờ đặt lịch.

  Sau đó khách hỏi: "Giá cắt tóc là bao nhiêu?"

  AI mới chuyển sang tư vấn giá.

  Yêu cầu:

  - Phân biệt ý định tư vấn, hỏi giá và đặt lịch.
  - Không mặc định khách muốn đặt lịch chỉ vì khách nói muốn cắt tóc.
  - Khi khách hỏi giá, ưu tiên xử lý yêu cầu báo giá.
  - Không thu thập ngày giờ và thông tin liên hệ khi khách chưa thể hiện ý định đặt lịch.

  ### BUG 2: Phân loại size tóc không nhất quán
  Quy tắc size hiện tại:

  SizeĐịnh nghĩaSTóc từ cằm trở lênMTóc từ cằm đến ngang vaiLTóc từ ngang ngực trở xuốngYêu cầu:

  - Khách nói tóc ngang hông phải được phân loại size L.
  - Khách nói tóc hơn ngực phải được phân loại size L.
  - Khách nói tóc ngang vai phải được phân loại size M.
  - Khi khách sửa lại thông tin, phải cập nhật size mới.
  - Không hỏi lại size nếu mô tả đã đủ căn cứ xác định.
  - Không tự ý thay đổi quy tắc phân loại trong dữ liệu dự án.

  ### BUG 3: Mất trạng thái dịch vụ khi khách thay đổi giờ
  Ví dụ:

  - Khách muốn đặt lịch 14 giờ ngày mai.
  - AI hỏi dịch vụ.
  - Khách chọn Cắt tóc.
  - AI ghi nhận dịch vụ.
  - Khách đổi giờ thành 15 giờ ngày mai.
  - AI quay lại lời chào và hỏi dịch vụ từ đầu.
  Yêu cầu:

  - Kiểm tra cách lưu booking state.
  - Kiểm tra conversation state có bị reset không.
  - Giữ nguyên dịch vụ đã xác nhận khi khách chỉ thay đổi giờ.
  - Chỉ cập nhật trường thông tin mà khách muốn thay đổi.
  - Không hỏi lại dữ liệu đã xác nhận nếu dữ liệu đó vẫn hợp lệ.

  ### BUG 4: Thu thập thông tin không đúng thứ tự
  AI đang yêu cầu kiểu tóc, ngày giờ, số điện thoại và email cùng lúc dù khách chưa xác nhận muốn đặt lịch.

  Yêu cầu quy trình:

  1. Xác định nhu cầu khách hàng.
  2. Xác định dịch vụ.
  3. Tư vấn dịch vụ và giá.
  4. Xác nhận khách có muốn đặt lịch không.
  5. Thu thập ngày giờ.
  6. Kiểm tra lịch trống.
  7. Thu thập thông tin liên hệ còn thiếu.
  8. Xác nhận đặt lịch.
  Không thu thập thông tin liên hệ khi khách chỉ đang hỏi giá hoặc tư vấn.

  ### BUG 5: AI báo bận khi khách chọn dịch vụ
  Ví dụ:

  Khách: "Cắt tạo kiểu".

  AI: "Hệ thống AI hiện đang bận hoặc đang kết nối lại".

  Yêu cầu điều tra:

  - AI provider.
  - API request và response.
  - HTTP status code.
  - Timeout và retry.
  - Tool calling.
  - JSON parsing.
  - Context và token.
  - Backend error handling.
  - Frontend xử lý phản hồi.
  Không được mặc định nguyên nhân là do AI provider.

  ---

  ## IV. CHUẨN HÓA SYSTEM PROMPT THEO 6 THÀNH PHẦN
  Phải kiểm tra System Prompt hiện tại và tổ chức lại theo cấu trúc sau.

  ### 1. Vai trò (Role)
  Xác định rõ:

  - AI là ai?
  - Đang đại diện cho đơn vị nào?
  - Đảm nhận nhiệm vụ gì?
  - Đối tượng giao tiếp là ai?
  - Phong cách giao tiếp như thế nào?
  Định hướng:

  AI là trợ lý tư vấn và hỗ trợ đặt lịch của Salon.

  Nhiệm vụ:

  - Chào hỏi khách hàng.
  - Tư vấn dịch vụ làm tóc.
  - Giải thích thông tin dịch vụ.
  - Báo giá dựa trên dữ liệu thực tế.
  - Hỗ trợ kiểm tra lịch trống.
  - Hỗ trợ đặt lịch.
  - Chuyển khách đến nhân viên khi cần thiết.
  Phong cách:

  - Tiếng Việt.
  - Lịch sự, thân thiện, chuyên nghiệp.
  - Trả lời ngắn gọn, dễ hiểu.
  - Không tự tạo thông tin không có căn cứ.

  ### 2. Phạm vi (Scope)
  Xác định rõ AI được phép sử dụng những dữ liệu nào.

  Các nguồn dữ liệu cần kiểm tra trong dự án:

  Nguồn dữ liệuMục đích`chatbox/database/data/categories.json`Lấy danh mục và mô tả dịch vụ`chatbox/database/data/products.json`Lấy giá dịch vụ theo sizeDữ liệu lịch hẹnKiểm tra lịch đã đặt và lịch còn trốngDữ liệu khách hàngTra cứu thông tin khách hàng theo quy địnhFAQ và dữ liệu tư vấnTrả lời câu hỏi thường gặpConversation historyHiểu ngữ cảnh hội thoại hiện tạiYêu cầu:

  - AI phải lấy dữ liệu từ nguồn thực tế.
  - Không tự bịa giá, thời lượng hoặc dịch vụ.
  - Không tự suy đoán lịch trống.
  - Không sử dụng thông tin của phiên đặt lịch khác nếu không có căn cứ hợp lệ.
  - Khi dữ liệu không tồn tại, phải thông báo rõ.

  ### 3. Quy tắc nghiệp vụ (Business Rules)
  Đây là phần quan trọng nhất.

  Coding Agent phải rà soát và đưa các quy tắc nghiệp vụ thực tế vào System Prompt.

  Các quy tắc bắt buộc:

  **A. Nhận diện nhu cầu**

  - Phân biệt tư vấn dịch vụ, hỏi giá và đặt lịch.
  - Khách nói "Tôi muốn cắt tóc" chưa đồng nghĩa với việc muốn đặt lịch.
  - Khi khách chưa xác định dịch vụ, ưu tiên hỏi khách muốn làm dịch vụ gì.
  - Không hỏi thông tin liên hệ khi chưa đến bước thu thập thông tin.
  **B. Tư vấn giá**

  - Lấy tên dịch vụ và mô tả từ `categories.json`.
  - Lấy giá từ `products.json`.
  - Giá có thể thay đổi theo size.
  - Nếu thiếu size, hỏi khách mô tả độ dài tóc.
  - Không tự tạo giá.
  **C. Phân loại size tóc**

  - S: Tóc từ cằm trở lên.
  - M: Tóc từ cằm đến ngang vai.
  - L: Tóc từ ngang ngực trở xuống.
  Phải xử lý được mô tả tự nhiên như:

  - Tóc ngắn.
  - Tóc ngang cằm.
  - Tóc ngang vai.
  - Tóc qua vai.
  - Tóc ngang ngực.
  - Tóc ngang hông.
  Nếu mô tả nằm ở vùng ranh giới hoặc không đủ rõ, hỏi lại để xác nhận.

  **D. Đặt lịch**

  - Chỉ bắt đầu quy trình đặt lịch khi khách có ý định đặt lịch rõ ràng.
  - Phải xác định dịch vụ trước khi kiểm tra lịch.
  - Ghi nhận ngày giờ khách cung cấp.
  - Kiểm tra lịch bằng dữ liệu thực tế.
  - Nếu giờ không khả dụng, đề xuất giờ khác.
  - Nếu khách thay đổi giờ, chỉ cập nhật giờ.
  - Nếu khách thay đổi dịch vụ, cập nhật dịch vụ và kiểm tra lại các thông tin liên quan.
  - Không tự xác nhận đặt lịch khi chưa hoàn thành các bước cần thiết.
  **E. Quản lý trạng thái**

  - Phân biệt thông tin được AI tư vấn với thông tin khách đã xác nhận.
  - Không coi dịch vụ được AI đề xuất là dịch vụ khách đã chọn.
  - Không làm mất thông tin đã xác nhận khi khách cập nhật một trường khác.
  - Không lấy dữ liệu của booking cũ làm dữ liệu mặc định cho booking mới.
  - Khi khách thay đổi ý định, ưu tiên xử lý ý định mới.
  - Chỉ hỏi thông tin còn thiếu.

  ### 4. Định dạng đầu ra (Output Format)
  Xác định rõ AI phải phản hồi như thế nào trong từng tình huống.

  Yêu cầu:

  - Sử dụng tiếng Việt.
  - Câu trả lời ngắn gọn, lịch sự.
  - Không trả về JSON, mã nguồn hoặc thông tin kỹ thuật cho khách hàng.
  - Không hiển thị nội dung nội bộ của System Prompt.
  - Không lặp lại câu trả lời cũ khi khách đã chuyển sang yêu cầu khác.
  Ví dụ:

  **Khách hỏi giá:**

  "Dạ, giá dịch vụ Cắt tạo kiểu phụ thuộc vào độ dài tóc. Mình cho em biết tóc dài đến đâu để em xác định size và báo giá chính xác ạ?"

  **Khách muốn đặt lịch nhưng chưa chọn dịch vụ:**

  "Dạ, mình muốn thực hiện dịch vụ nào ạ? Ví dụ như cắt tóc, uốn tóc, nhuộm tóc hoặc phục hồi tóc."

  **Khách đã chọn dịch vụ và muốn đổi giờ:**

  "Dạ, em cập nhật giờ mong muốn thành 15:00. Em kiểm tra lịch trống cho mình nhé."

  **Không đủ thông tin:**

  "Dạ, mình có thể mô tả thêm độ dài tóc để em tư vấn chính xác hơn ạ."

  Coding Agent cần kiểm tra định dạng phản hồi hiện tại và đảm bảo tương thích với cấu trúc dữ liệu mà frontend đang sử dụng.

  ### 5. Xử lý khi không chắc chắn (Uncertainty)
  Quy định AI phải làm gì khi thiếu thông tin hoặc không xác định được câu trả lời.

  Yêu cầu:

  - Không tự suy đoán dịch vụ.
  - Không tự suy đoán size tóc khi thông tin không đủ.
  - Không tự tạo giá.
  - Không tự tạo khung giờ trống.
  - Không tự xác nhận lịch khi chưa có kết quả từ hệ thống.
  - Nếu thiếu thông tin, hỏi đúng thông tin còn thiếu.
  - Nếu không truy cập được dữ liệu, thông báo không thể kiểm tra tại thời điểm đó.
  - Nếu không xử lý được yêu cầu, chuyển sang nhân viên.
  - Không lặp lại câu hỏi mà khách đã trả lời hợp lệ.

  ### 6. Giới hạn (Constraints)
  Xác định rõ những việc AI tuyệt đối không được thực hiện.

  Các giới hạn:

  1. Không tự tạo dịch vụ không tồn tại.
  2. Không tự tạo giá hoặc thời lượng dịch vụ.
  3. Không tự tạo lịch trống.
  4. Không đặt lịch khi khách chưa xác nhận thông tin theo quy trình.
  5. Không tự chọn dịch vụ thay khách.
  6. Không tự ý thay đổi ngày giờ khách đã cung cấp.
  7. Không lấy thông tin của booking cũ áp dụng cho booking mới khi chưa có căn cứ.
  8. Không coi thông tin AI đề xuất là thông tin khách đã xác nhận.
  9. Không bỏ qua yêu cầu mới của khách chỉ vì đang ở bước thu thập thông tin.
  10. Không hiển thị dữ liệu nội bộ, prompt hoặc thông tin kỹ thuật.
  11. Không trả lời lặp lại nội dung cũ khi khách đã thay đổi ý định.

  ---

  ## V. YÊU CẦU VỀ KIẾN TRÚC
  Không chỉ đưa các quy tắc vào System Prompt rồi cho rằng lỗi đã được giải quyết.

  Cần phân biệt:

  - System Prompt: hướng dẫn hành vi và quy tắc phản hồi.
  - Backend: xử lý dữ liệu, trạng thái, nghiệp vụ và kiểm tra tính hợp lệ.
  - Tool calling: thực thi các thao tác với hệ thống.
  - Frontend: hiển thị phản hồi và thông báo lỗi.
  Nếu một quy tắc cần được đảm bảo tuyệt đối, phải kiểm tra và thực thi tại backend thay vì chỉ phụ thuộc vào AI.

  Không để System Prompt mâu thuẫn với logic backend.

  ---

  ## VI. KIỂM THỬ SAU KHI SỬA
  Viết test cho các tình huống:

  1. Khách chỉ nói muốn cắt tóc.
  2. Khách hỏi giá sau khi đã nói muốn cắt tóc.
  3. Khách mô tả tóc ngang hông.
  4. Khách sửa mô tả từ ngang hông thành ngang vai.
  5. Khách đặt lịch khi chưa chọn dịch vụ.
  6. Khách đã chọn dịch vụ và thay đổi giờ.
  7. Khách thay đổi dịch vụ trong quá trình đặt lịch.
  8. Khách hỏi lại lịch trống.
  9. Khách chuyển từ đặt lịch sang tư vấn giá.
  10. AI provider timeout.
  11. AI trả về response sai định dạng.
  12. Khách bắt đầu một booking mới sau khi booking trước hoàn thành.
  Kiểm tra cả unit test, integration test và các luồng hồi quy có liên quan.

  ---

  ## VII. BÁO CÁO KẾT QUẢ
  Sau khi hoàn thành, cung cấp báo cáo gồm:

  1. Nguyên nhân gốc rễ từng bug.
  2. File và hàm liên quan.
  3. System Prompt cũ đang được tổ chức như thế nào.
  4. System Prompt mới theo 6 thành phần.
  5. Những quy tắc nghiệp vụ được bổ sung.
  6. Các file code đã thay đổi.
  7. Các test đã viết.
  8. Kết quả chạy test.
  9. Các chức năng cũ đã kiểm tra hồi quy.
  10. Những vấn đề chưa xử lý được.
  Yêu cầu cuối cùng:

  Không được chỉ báo cáo rằng đã cập nhật System Prompt. Phải chứng minh các luồng nghiệp vụ hoạt động đúng thông qua test thực tế.
  ```
- **Kết quả AI trả về:** `a5a6860:chatbox/BUG_REPORT.md` ghi sáu lỗi, gồm nhầm `SELECT_TIME_SLOT`, mất danh sách slot/context, không cập nhật `selected_time`, trả lại toàn bộ danh sách giờ và nội dung sai vai trò. `a5a6860:chatbox/TEST_REPORT.md` ghi 22/22 test đạt sau sửa; bằng chứng này xác nhận kết quả được báo cáo, không tự xác nhận rằng tôi đã chạy lại toàn bộ test.
- **Đánh giá của tôi:** [CẦN TÔI BỔ SUNG: Tôi đã tái hiện lỗi bằng hội thoại nào và tự xác nhận 22 test ra sao?]
- **Điều chỉnh:** Prompt quy định trình tự đọc log → kiểm tra source/prompt → phân tích nguyên nhân → lập kế hoạch → sửa → viết và chạy test. Hồ sơ test ghi các nhóm intent, state persistence và end-to-end chọn/đổi slot; [CẦN TÔI BỔ SUNG: Tôi có trực tiếp xem kết quả từng test và yêu cầu chỉnh sửa thêm không?]
- **Bài học:** Chatbot đặt lịch cần được kiểm tra như một quy trình nhiều lượt, không chỉ kiểm tra từng hàm riêng.

### Lượt 10 — Sửa UX website khách hàng và tài khoản · 31/10/2026 · Thất bại một phần

- **Bối cảnh & mục tiêu:** Chuẩn hóa điều hướng website khách, bổ sung trang tài khoản và sửa hành vi các nút tư vấn trên card dịch vụ.
- **Prompt đã dùng:** [TÔI CẦN BỔ SUNG PROMPT GỐC]. Commit `3505d7b` và báo cáo thay đổi không lưu prompt giao việc nguyên văn.
- **Kết quả AI trả về:** Báo cáo [web_khach/bao-cao.md](./fixbug/web_khach/bao-cao.md) ghi các hạng mục UI đã cập nhật và một số test auth đạt. Tuy nhiên, `appointments.test.js` còn 4 assertion thất bại; báo cáo cũng ghi chưa kiểm tra gửi form thật, chatbot đặt lịch end-to-end và màn hình quản trị.
- **Đánh giá của tôi:** [CẦN TÔI BỔ SUNG: Tôi có chấp nhận phần giao diện dù còn lỗi test/luồng chưa kiểm tra không?]
- **Điều chỉnh:** Báo cáo giữ API đặt lịch/admin ngoài phạm vi sửa; không có bằng chứng về lần điều chỉnh tiếp theo cho bốn assertion.
- **Bài học:** Cần chốt trước tiêu chí “hoàn thành” khi sửa UI nhưng test hồi quy liên quan nằm ở phần nghiệp vụ khác.
- **Mẫu thất bại:** **F11 Mắc kẹt ở "vòng 70%"**
- **Dấu hiệu nhận biết:** Một phần UI đã xong nhưng còn assertion và các luồng end-to-end chưa xác minh.
- **Nguyên nhân gốc:** Báo cáo cho biết phạm vi sửa giới hạn ở website khách, trong khi một số lỗi test thuộc nghiệp vụ đặt lịch và một số luồng chưa được chạy; đây là khoảng cách phạm vi/tiêu chí nghiệm thu.
- **Biện pháp phòng tránh áp dụng sau đó:** Lập ma trận phạm vi và test hồi quy, ghi rõ lỗi ngoài phạm vi cùng quyết định nghiệm thu; [CẦN TÔI BỔ SUNG: xác nhận đây có phải quy trình bạn áp dụng.]

## 4. Tổng kết

Trong 10 lượt được chọn, mẫu nổi bật theo bằng chứng là **F3 Chấp nhận mù** (2 lượt), cùng **F10 Nợ kỹ thuật vô hình** và **F11 Mắc kẹt ở "vòng 70%"**. Đây là phân loại biên tập từ hồ sơ, cần bạn xác nhận; chưa đủ dữ liệu để suy ra tần suất của toàn bộ dự án. Ba thực hành có bằng chứng tốt là chia yêu cầu theo tiêu chí, chạy test có dữ liệu mô phỏng và dùng review adversarial trước nghiệm thu. Điều cần làm khác đi là kiểm tra hội thoại end-to-end và nhánh lỗi thực tế trước khi coi báo cáo test xanh là hoàn tất. Phần tự đánh giá cá nhân vẫn cần người học bổ sung.

## 5. Phụ lục — Đối chiếu lượt với commit/hồ sơ

| Lượt | Hash/hồ sơ bằng chứng |
|---:|---|
| 1 | `26dfaef` (hồ sơ yêu cầu/handoff); `a5a6860` (báo cáo lỗi chatbot và test) |
| 2 | `26dfaef` (dispatch/handoff M1) |
| 3 | `26dfaef` (dispatch/handoff M2); `a5a6860` (remediation theo review) |
| 4 | `26dfaef` (dispatch/handoff M3) |
| 5 | `26dfaef` (dispatch/handoff M4) |
| 6 | `26dfaef` (handoff M4, ghi các lỗi test và cách sửa) |
| 7 | `26dfaef` (handoff điều phối, ghi finding của review) |
| 8 | `26dfaef` (dispatch remediation); `a5a6860` (báo cáo lỗi/test sau sửa) |
| 9 | `a5a6860` |
| 10 | `3505d7b` |

> **Trạng thái sử dụng:** Đây là bản nháp dựa trên hồ sơ kỹ thuật. Trước khi nộp, cần bổ sung các mục `[CẦN TÔI BỔ SUNG: ...]`, kiểm tra tên công cụ AI thực tế và xác nhận các đánh giá ở ngôi thứ nhất.
