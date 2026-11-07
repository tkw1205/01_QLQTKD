# Nhật ký làm việc với AI — MIS3047, Bài 5.4

## 1. Thông tin dự án

- **Tên dự án:** Nền tảng Chatbox Tư vấn Sản phẩm & Đặt Lịch Tự Động (AI + Nhân Viên), với luồng nghiệp vụ đặt lịch cho salon.
- **Mô tả:** Website hỗ trợ khách tìm hiểu dịch vụ, trò chuyện với AI hoặc nhân viên và đặt lịch. Backend dùng Node.js/Express cùng kho dữ liệu JSON cục bộ; các yêu cầu được ghi lại gồm đặt lịch, giữ slot, hội thoại và quản lý phiên.
- **Nhóm/sinh viên:** Hồ sơ kỹ thuật được dùng để lập nhật ký không ghi nhận tên nhóm/thành viên.
- **Công cụ AI:** Hồ sơ repo ghi các vai trò `orchestrator`, `worker`, `reviewer`, `challenger`; không lưu tên sản phẩm/model AI thực tế.
- **Khoảng thời gian bằng chứng:** 29/10/2026–07/11/2026. Hồ sơ gốc và commit dự án được đối chiếu với lịch sử phiên ghi trong Git; các lượt chỉnh nhật ký hiện tại được đánh dấu riêng.
- **Cách ghi nhận:** Các prompt trong nhật ký được biên tập theo cùng cấu trúc 8 mục. Nguồn gốc được dẫn kèm; nội dung nào không còn nguyên văn được ghi rõ là biên tập/diễn đạt lại, không xem là trích dẫn chính xác. Đánh giá dựa trên bằng chứng lưu trong repo, không khẳng định trải nghiệm cá nhân chưa được ghi lại.

## 2. Bảng tổng quan

Đã khôi phục được **62 tin nhắn người dùng** từ các bản ghi phiên cục bộ trong khoảng 31/10–07/11/2026. Đây là số message event, gồm cả prompt công việc, câu hỏi tiếp nối và thao tác Git; không đồng nghĩa với 62 nhiệm vụ riêng. Mục 3 ghi 10 lượt ban đầu; mục 7 bổ sung 10 lượt mới từ 01–06/11, được chọn từ hồ sơ/cache và không cộng thêm vào 62. Một số prompt chỉ còn bản tóm tắt, được ghi rõ thay vì trình bày như nguyên văn. Con số 27 ở bản trước là sai: nó đếm một phần checkpoint Git thay cho lượt chat và bỏ sót cache.

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

## 3. Nhật ký chi tiết — 10 lượt đầu

### Lượt 1 — Triển khai yêu cầu đặt lịch và chat theo nhiều nhóm · 30/10–31/10/2026 · Thất bại một phần

- **Bối cảnh & mục tiêu:** Chia yêu cầu đặt lịch salon thành các nhánh song song, gồm email tùy chọn, TTL giữ slot, vòng đời phiên chat, độ ổn định JSON và kiểm thử. Các hồ sơ ban đầu báo hoàn thành; tài liệu điều tra ngày 31/10 sau đó ghi nhận các lỗi chọn giờ và duy trì ngữ cảnh.
- **Prompt (biên tập theo cấu trúc yêu cầu từ [ORIGINAL_REQUEST.md](../.agents/teamwork/ORIGINAL_REQUEST.md); không phải nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – TRIỂN KHAI WEBSITE ĐẶT LỊCH SALON VÀ CHATBOX AI

  ## MỤC TIÊU
  Phân chia công việc cho worker/reviewer để kiểm tra, phân tích và triển khai các yêu cầu website đặt lịch salon/chatbox AI cho môi trường production; xác minh luồng đặt lịch, chat và phiên hoạt động đúng.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc `docs/spec/business_spec_booking.md`, `docs/spec/Câu-trả-lời.docx`, `docs/spec/phieu_lam_ro_change_request.md` và trạng thái phiên trước trong `.agents/teamwork/`. Đối chiếu source, dữ liệu và test hiện có trong repo.

  ## CÁC TOOL/API CẦN CÓ
  Rà soát API đặt lịch, chat, quản lý phiên và kho dữ liệu hiện có; xác định input/output theo source. Không tự tạo endpoint/tool nếu chưa có căn cứ trong dự án.

  ## KỊCH BẢN XỬ LÝ
  IF yêu cầu/hồ sơ chưa rõ THEN ghi câu hỏi hoặc giả định cần xác nhận.
  IF task được giao THEN worker kiểm tra source/spec, triển khai trong phạm vi, chạy test liên quan và bàn giao bằng chứng.
  IF thay đổi chạm nghiệp vụ quan trọng THEN reviewer/challenger kiểm tra độc lập cả luồng thành công và lỗi.

  ## QUY TẮC NGHIỆP VỤ
  Bám đặc tả đã cung cấp; không khẳng định production-ready chỉ dựa trên việc code hoàn tất; không che giấu test chưa chạy hoặc lỗi còn lại.

  ## QUẢN LÝ INTENT VÀ STATE
  Bảo toàn ngữ cảnh khách, booking và phiên qua các lượt chat; chỉ thay đổi trường khách vừa cập nhật; không dùng state cũ nếu phiên/booking mới.

  ## YÊU CẦU TRIỂN KHAI
  Chia task rõ ràng, tránh xung đột file; điều tra trước khi sửa; review kết quả; chạy test; báo cáo file/hàm đổi, kết quả và giới hạn.

  ## KẾT QUẢ MONG MUỐN
  Các luồng đúng theo đặc tả, có kiểm thử và review bằng chứng; bàn giao nêu rõ hoàn thành/chưa hoàn thành, lỗi và rủi ro còn lại.
  ```
- **Kết quả AI trả về:** Hồ sơ điều phối báo các yêu cầu đã hoàn thành và kiểm thử đạt; tuy nhiên, báo cáo điều tra tiếp theo liệt kê sáu lỗi chatbot, gồm nhận diện sai ý định chọn giờ, mất context, không lưu giờ đã chọn và nội dung sai vai trò. Bằng chứng: `26dfaef`, `a5a6860:chatbox/BUG_REPORT.md` và `a5a6860:chatbox/TEST_REPORT.md`.
- **Đánh giá:** Báo cáo xanh chưa đủ chứng minh các luồng chat nhiều lượt đúng; sáu lỗi tìm thấy sau đó cho thấy còn thiếu kiểm tra tình huống thực tế/state, dù phạm vi kiểm thử ban đầu đã đạt.
- **Điều chỉnh:** Sau khi lỗi được ghi nhận, yêu cầu được cụ thể hóa thành điều tra nguyên nhân, test tình huống chọn/đổi giờ và kiểm tra duy trì ngữ cảnh. Báo cáo sau sửa ghi 22/22 test đạt; hồ sơ không xác nhận ai trực tiếp chạy lại.
- **Bài học:** Kết quả test xanh chỉ có giá trị trong phạm vi tình huống mà test thực sự bao phủ.
- **Mẫu thất bại:** **F3 Chấp nhận mù**
- **Dấu hiệu nhận biết:** Có báo cáo hoàn thành/test xanh trước khi tài liệu khác ghi nhận lỗi ở luồng hội thoại thực tế.
- **Nguyên nhân gốc:** Theo báo cáo lỗi, các tình huống chọn giờ, lưu booking state và phản hồi theo vai trò chưa được bao phủ đầy đủ; nguyên nhân không thể quy về “AI sai” chung chung.
- **Biện pháp phòng tránh:** Đưa các tình huống hội thoại nhiều lượt và trạng thái đặt lịch vào kiểm thử hồi quy; đây là biện pháp thể hiện trong hồ sơ sau sửa, không phải lời xác nhận về thao tác cá nhân.

### Lượt 2 — Email tùy chọn và tra cứu lịch bằng mã đặt chỗ · 30/10/2026 · Thành công

- **Bối cảnh & mục tiêu:** Cho phép đặt lịch không cần email và tra cứu lịch bằng số điện thoại cùng booking code, không phụ thuộc phiên trình duyệt cũ.
- **Prompt (biên tập theo cấu trúc yêu cầu từ [worker_m1/DISPATCH.md](../.agents/teamwork/worker_m1/DISPATCH.md); không phải nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – EMAIL TÙY CHỌN VÀ TRA CỨU LỊCH

  ## MỤC TIÊU
  Cho phép bỏ trống email khi đặt lịch trên web/API và hỗ trợ tra cứu lịch bằng số điện thoại cùng booking code, không phụ thuộc session trình duyệt cũ.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Kiểm tra `src/routes/appointments.js`, `src/services/appointmentService.js`, `public/appointments.html`, `public/js/appointments.js`, các repository tra cứu lịch và `tests/appointments.test.js`.

  ## CÁC TOOL/API CẦN CÓ
  Dùng endpoint đặt lịch và tra cứu hiện có. Đầu vào đặt lịch phải chấp nhận email null/rỗng; tra cứu nhận phone và booking code; trả lịch đã xác thực hoặc lỗi phù hợp. Không tự suy ra lịch từ session cũ.

  ## KỊCH BẢN XỬ LÝ
  IF email bị bỏ trống THEN vẫn cho gửi đặt lịch nếu các trường bắt buộc khác hợp lệ.
  IF email có giá trị THEN tiếp tục xác thực theo quy tắc hiện hành.
  IF khách tra cứu bằng phone + booking code hợp lệ THEN trả lịch tương ứng; ELSE báo không tìm thấy/không hợp lệ.
  Hội thoại mẫu: khách nhập thông tin không có email → form vẫn gửi được và backend lưu booking hợp lệ.

  ## QUY TẮC NGHIỆP VỤ
  Gắn nhãn “Không bắt buộc” cho email; không hạ yêu cầu của các trường bắt buộc khác; bảo vệ thông tin lịch và không trả kết quả khi định danh không khớp.

  ## QUẢN LÝ INTENT VÀ STATE
  Tra cứu phải dựa trên dữ liệu định danh gửi trong request, không dựa vào phiên trình duyệt/AI; không thay đổi booking state khi chỉ tra cứu.

  ## YÊU CẦU TRIỂN KHAI
  Cập nhật API, service và UI; bổ sung test cho email null/rỗng/có giá trị và tra cứu hợp lệ/không hợp lệ; kiểm tra UI và hồi quy liên quan.

  ## KẾT QUẢ MONG MUỐN
  Email thực sự tùy chọn đồng nhất trên API/UI; tra cứu trả đúng booking theo phone và booking code; báo file đổi và kết quả test.
  ```
- **Kết quả AI trả về:** Handoff M1 ghi nhận email rỗng được chuẩn hóa, endpoint tra cứu được bổ sung và kiểm thử `appointments.test.js` đạt 4/4. Đây là kết quả được báo trong handoff, không phải kết quả tôi tự chạy lại trong lần biên tập này.
- **Đánh giá:** Yêu cầu nêu rõ cả hành vi API lẫn nhãn giao diện, và handoff ghi 4/4 test đạt; tuy vậy hồ sơ không chứng minh đã kiểm tra thủ công UI hoặc diff.
- **Điều chỉnh:** Không có prompt điều chỉnh tiếp theo được lưu. Tiêu chí ban đầu đã bao gồm cả API và UI; lần sau cần giữ cùng phạm vi kiểm tra để tránh chỉ dựa vào kết quả unit test.
- **Bài học:** Nêu rõ trường dữ liệu bắt buộc/tùy chọn và cách tra cứu giúp yêu cầu kiểm thử được cụ thể hơn.

### Lượt 3 — TTL giữ slot 5 phút · 30/10/2026 · Thành công nhưng phải sửa

- **Bối cảnh & mục tiêu:** Đồng bộ thời hạn giữ lịch từ 10 phút xuống 5 phút trong repository, AI tools và prompt hệ thống; cho phép email tùy chọn.
- **Prompt (biên tập theo cấu trúc yêu cầu từ [worker_m2/DISPATCH.md](../.agents/teamwork/worker_m2/DISPATCH.md); không phải nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – ĐỒNG BỘ TTL GIỮ SLOT 5 PHÚT

  ## MỤC TIÊU
  Đổi thời hạn giữ slot từ 10 phút thành 5 phút và đồng bộ hành vi, nội dung phản hồi cùng tài liệu liên quan.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Kiểm tra `src/repositories/appointmentRepository.js`, các AI tools, API xác nhận/giữ lịch, prompt hệ thống, thông báo cho khách và test TTL/expiration.

  ## CÁC TOOL/API CẦN CÓ
  Rà soát API tạo hold và xác nhận hold hiện có. Hold nhận slot/booking cần thiết; response phản ánh thời điểm hết hạn; xác nhận trả thành công hoặc lỗi hết hạn (HTTP 410 theo hành vi hiện tại).

  ## KỊCH BẢN XỬ LÝ
  IF hold được tạo THEN thời hạn là 5 phút.
  IF khách xác nhận trước hạn và slot còn hợp lệ THEN hoàn tất xác nhận.
  IF hold hết hạn THEN trả lỗi expiration đúng nhánh, không để cleanup che mất lỗi.
  Hội thoại mẫu: khách xác nhận sau khi hold hết hạn → thông báo slot hết hạn và đề xuất kiểm tra giờ khác.

  ## QUY TẮC NGHIỆP VỤ
  Dùng một TTL thống nhất là 300.000 ms; giải phóng slot hết hạn; thông báo không được ghi thời hạn cũ; không xác nhận slot đã hết hạn.

  ## QUẢN LÝ INTENT VÀ STATE
  Giữ thông tin booking để khách có thể tiếp tục/chọn slot mới; không coi hold hết hạn là booking đã xác nhận.

  ## YÊU CẦU TRIỂN KHAI
  Cập nhật repository, AI tools/prompt, API response và test cho tạo hold, trước hạn, hết hạn và cleanup; rà mọi bề mặt có nhắc TTL.

  ## KẾT QUẢ MONG MUỐN
  TTL, phản hồi API và nhánh expiration đều nhất quán 5 phút; báo các test chạy và lỗi còn lại.
  ```
- **Kết quả AI trả về:** Handoff M2 ghi TTL 300.000 ms, tự giải phóng slot và cập nhật mô tả AI. Review sau đó vẫn phát hiện chuỗi thông báo “10 phút” và lỗi thứ tự xử lý khi slot hết hạn. Bằng chứng: [worker_m2/handoff.md](../.agents/teamwork/worker_m2/handoff.md), [orchestrator/handoff.md](../.agents/teamwork/orchestrator/handoff.md), commit `a5a6860`.
- **Đánh giá:** Thay đổi TTL chính đã có nhưng chưa đồng bộ hết các bề mặt: review vẫn tìm thấy thông báo 10 phút và nhánh hết hạn sai. Vì vậy kết quả chỉ hoàn tất một phần trước review.
- **Điều chỉnh:** Chuyển hai finding cụ thể sang lượt remediation 8 và yêu cầu cập nhật phản hồi API cùng nhánh xử lý hết hạn.
- **Bài học:** Thay đổi một quy tắc nghiệp vụ cần được rà soát trên mọi bề mặt: API, AI tools, prompt, thông báo và test.

### Lượt 4 — Timeout phiên chat hai giai đoạn · 30/10/2026 · Thành công

- **Bối cảnh & mục tiêu:** Sau 5 phút im lặng cảnh báo khách, sau tổng 10 phút đóng phiên; tin nhắn mới tạo phiên mới; phiên nhân viên dùng timeout 60 phút.
- **Prompt (biên tập theo cấu trúc yêu cầu từ [worker_m3/DISPATCH.md](../.agents/teamwork/worker_m3/DISPATCH.md); không phải nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – TIMEOUT HAI GIAI ĐOẠN CHO PHIÊN CHAT

  ## MỤC TIÊU
  Sau 5 phút không hoạt động ở chế độ AI gửi cảnh báo; sau tổng 10 phút đóng phiên; tin nhắn mới tạo phiên mới; phiên nhân viên dùng timeout 60 phút.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Kiểm tra service timeout, conversation/session state, route/socket handler, cấu hình timeout và `tests/conversations.test.js` cùng test lifecycle.

  ## CÁC TOOL/API CẦN CÓ
  Dùng scheduler/socket/session API hiện có. Đầu vào gồm session, mode, thời điểm hoạt động cuối; đầu ra là cảnh báo/đóng phiên và state cập nhật. Không tạo lịch nhắc qua dịch vụ ngoài nếu chưa có.

  ## KỊCH BẢN XỬ LÝ
  IF AI mode im lặng 5 phút THEN gửi một cảnh báo.
  IF không có hoạt động đến tổng 10 phút THEN đóng phiên.
  IF khách nhắn sau khi phiên đóng THEN mở phiên mới.
  IF phiên ở staff mode THEN áp dụng timeout 60 phút.

  ## QUY TẮC NGHIỆP VỤ
  Không gửi cảnh báo lặp; không đóng phiên trước hạn; chỉ áp dụng đúng timeout theo mode; phiên đã đóng không được coi là đang hoạt động.

  ## QUẢN LÝ INTENT VÀ STATE
  Lưu trạng thái cảnh báo/đóng phiên; tin nhắn mới đi vào conversation mới theo thiết kế, không lấy nhầm context phiên cũ.

  ## YÊU CẦU TRIỂN KHAI
  Cập nhật timeout service và tích hợp liên quan; dùng thời gian mô phỏng/fake timer để test cảnh báo, đóng phiên, tin nhắn mới và staff mode; rà Socket.IO/UI nếu phù hợp.

  ## KẾT QUẢ MONG MUỐN
  Đúng các mốc 5/10/60 phút, chỉ cảnh báo một lần, phiên mới hoạt động đúng; báo test và giới hạn kiểm tra giao diện.
  ```
- **Kết quả AI trả về:** Handoff M3 ghi service timeout, tạo phiên mới khi khách nhắn lại phiên đã đóng, và timeout 60 phút cho nhân viên; `tests/conversations.test.js` được báo cáo đạt 5/5.
- **Đánh giá:** Handoff ghi 5/5 test hội thoại đạt và bao gồm timeout hai giai đoạn, nhưng không có bằng chứng về kiểm tra Socket.IO/UI thủ công.
- **Điều chỉnh:** Dùng thời gian mô phỏng trong test để xác minh cảnh báo, đóng phiên và khởi tạo phiên mới; không có prompt điều chỉnh riêng được lưu.
- **Bài học:** Dùng thời gian mô phỏng giúp kiểm thử timeout nhanh và ít phụ thuộc thời gian thực.

### Lượt 5 — Ổn định JSON store và mở rộng kiểm thử · 30/10/2026 · Thành công

- **Bối cảnh & mục tiêu:** Tránh tranh chấp khi ghi JSON, lỗi rename trên Windows và đảm bảo bộ test chạy hết.
- **Prompt (biên tập theo cấu trúc yêu cầu từ [worker_m4/DISPATCH.md](../.agents/teamwork/worker_m4/DISPATCH.md); không phải nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – ỔN ĐỊNH JSON STORE VÀ ĐẠT TIÊU CHÍ TEST

  ## MỤC TIÊU
  Xử lý tranh chấp khi ghi JSON và lỗi rename trên Windows; xác minh tiêu chí CR-01..CR-06, AC-01..AC-20 bằng bộ test.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Kiểm tra JSON store/repository, luồng ghi file tạm/rename, các test acceptance và test dùng chung dữ liệu, cùng các yêu cầu booking/session.

  ## CÁC TOOL/API CẦN CÓ
  Dùng helper đọc/ghi JSON hiện có; xác định input collection/data và kết quả ghi/lỗi. Rà cơ chế mutex, retry và cleanup; không đổi giao diện repository ngoài yêu cầu.

  ## KỊCH BẢN XỬ LÝ
  IF nhiều thao tác cùng ghi collection THEN không làm mất cập nhật.
  IF rename tạm thời lỗi trên Windows THEN retry có giới hạn và trả lỗi rõ nếu vẫn thất bại.
  IF test chạy THEN dữ liệu được cô lập, test chạy tuần tự khi cần, tài nguyên được teardown.

  ## QUY TẮC NGHIỆP VỤ
  Không tuyên bố 100% đạt nếu có test chưa chạy/skip/fail; không xóa dữ liệu dùng chung ngoài fixture; bảo đảm thao tác ghi hoàn tất hoặc báo lỗi minh bạch.

  ## QUẢN LÝ INTENT VÀ STATE
  Bảo toàn dữ liệu booking/conversation khi ghi; test phải làm sạch dữ liệu riêng mà không ảnh hưởng state ngoài test.

  ## YÊU CẦU TRIỂN KHAI
  Thực hiện R4/R5 và acceptance CR-01..CR-06, AC-01..AC-20; bổ sung test ghi đồng thời, retry/cleanup và chạy toàn bộ suite tuần tự; đóng server/tài nguyên trong teardown.

  ## KẾT QUẢ MONG MUỐN
  Báo cáo số suite/test đạt, lỗi/skip, thay đổi về JSON store và giới hạn (đặc biệt an toàn nhiều tiến trình); chỉ xác nhận hoàn tất khi có kết quả thực tế.
  ```
- **Kết quả AI trả về:** Handoff ghi mutex theo collection, retry rename, dọn file tạm, chạy test tuần tự và bổ sung test vòng đời phiên/tra cứu. Kết quả cuối được ghi là 119/119 test trên 20 suite đạt; xem [worker_m4/handoff.md](../.agents/teamwork/worker_m4/handoff.md).
- **Đánh giá:** Kết quả 119/119 đạt là tín hiệu tốt cho bộ test đã chạy; tuy nhiên, mutex theo collection không chứng minh an toàn giữa nhiều tiến trình, và handoff không xác nhận giới hạn đó đã được kiểm tra.
- **Điều chỉnh:** Handoff ghi cô lập dữ liệu test, dùng ngày động, xử lý provider ngoại tuyến và chạy test tuần tự để giảm nhiễu giữa các test.
- **Bài học:** Với kho JSON dùng chung, tính cô lập của test và tính nguyên tử khi ghi dữ liệu phải được kiểm tra cùng nhau.

### Lượt 6 — Sửa lỗi phát sinh trong bộ test · 30/10/2026 · Thất bại một phần

- **Bối cảnh & mục tiêu:** Khi chạy yêu cầu toàn bộ test, các giả định cũ về TTL, dữ liệu test, dịch vụ Ollama và đóng server gây lỗi hoặc treo.
- **Prompt (biên tập theo cấu trúc yêu cầu từ [worker_m4/DISPATCH.md](../.agents/teamwork/worker_m4/DISPATCH.md); không phải nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – ĐIỀU TRA VÀ SỬA TEST SUITE KHÔNG ỔN ĐỊNH

  ## MỤC TIÊU
  Chạy `npm test`, xác định nguyên nhân các test fail/treo và đưa bộ test acceptance về trạng thái không còn lỗi, dựa trên kết quả đo được.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc output test, fixtures/ngày giờ, dữ liệu JSON dùng chung, cấu hình Ollama/provider và setup/teardown server test; đối chiếu với handoff M4.

  ## CÁC TOOL/API CẦN CÓ
  Dùng runner `npm test` và các lệnh test mục tiêu hiện có; kiểm tra provider mock/fallback cùng teardown server. Ghi rõ lệnh, exit status và số test.

  ## KỊCH BẢN XỬ LÝ
  IF test fail THEN tái hiện và phân loại lỗi code, dữ liệu, thời gian hay dependency ngoài.
  IF Ollama không hoạt động THEN test logic không được treo hoặc báo xanh giả; xử lý theo cơ chế mock/fallback có kiểm soát.
  IF server test được mở THEN bảo đảm teardown đóng server dù test pass/fail.

  ## QUY TẮC NGHIỆP VỤ
  Không sửa expected chỉ để làm test xanh nếu behavior yêu cầu chưa được xác minh; không dùng ngày cố định đã qua; không dùng slot dễ đụng fixture khác.

  ## QUẢN LÝ INTENT VÀ STATE
  Cô lập state/dữ liệu giữa test, dọn dữ liệu sau chạy và tránh song song các test cùng sửa JSON store.

  ## YÊU CẦU TRIỂN KHAI
  Sửa root cause, chuyển sang ngày động khi phù hợp, chạy test tuần tự, thêm cleanup/fallback và chạy lại `npm test`; báo từng lỗi còn lại.

  ## KẾT QUẢ MONG MUỐN
  100% suite pass, 0 failure chỉ khi kết quả runner chứng minh điều đó; nếu không đạt, liệt kê test fail, nguyên nhân và bước chưa hoàn thành.
  ```
- **Kết quả AI trả về:** Handoff ghi test cũ vẫn kỳ vọng TTL 10 phút; một test đụng slot 10:30 do dữ liệu dùng chung; một test dùng ngày quá khứ; Ollama ngoại tuyến trả `ECONNREFUSED`; server test mở làm tiến trình treo. Sau điều chỉnh, handoff ghi 119/119 đạt.
- **Đánh giá:** Các lỗi không chỉ nằm ở logic sản phẩm mà còn ở giả định của test runner: dữ liệu dùng chung, ngày cố định, phụ thuộc Ollama và tài nguyên server chưa đóng. Báo cáo 119/119 đạt sau sửa được ghi trong handoff, không có bằng chứng người biên tập tự chạy lại.
- **Điều chỉnh:** Handoff ghi các thay đổi gồm chạy tuần tự, dọn dữ liệu, dùng ngày tương lai động, fallback khi Ollama ngoại tuyến và đóng server sau test.
- **Bài học:** Test dựa trên dịch vụ ngoài và dữ liệu dùng chung cần được cô lập hoặc giả lập để kết quả ổn định.
- **Mẫu thất bại:** **F10 Nợ kỹ thuật vô hình**
- **Dấu hiệu nhận biết:** Các vấn đề tiềm ẩn trong test runner, dữ liệu dùng chung, ngày cố định và dịch vụ ngoại tuyến chỉ lộ ra khi chạy toàn bộ suite.
- **Nguyên nhân gốc:** Handoff xác định test chạy song song trên một kho JSON chung; một số fixture đã cũ/phụ thuộc môi trường và server test chưa được đóng.
- **Biện pháp phòng tránh:** Cô lập dữ liệu/ngày, giả lập hoặc dự phòng dịch vụ ngoài, và đóng tài nguyên trong teardown; handoff ghi nhận các biện pháp này được đưa vào sau sự cố.

### Lượt 7 — Review phát hiện lỗi sau khi test xanh · 30/10/2026 · Thất bại một phần

- **Bối cảnh & mục tiêu:** Kiểm tra adversarial sau khi bộ test tổng thể được báo cáo đạt, tập trung vào việc giữ slot và thời hạn 5 phút.
- **Prompt (biên tập theo cấu trúc yêu cầu từ finding trong handoff; không có nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – REVIEW ADVERSARIAL TTL GIỮ SLOT

  ## MỤC TIÊU
  Review độc lập thay đổi TTL 5 phút sau khi test tổng thể được báo đạt; tìm thông báo cũ, lỗi hết hạn và nhánh lỗi không tới được.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Kiểm tra appointment repository/service, API hold/confirm, thông báo khách, AI tools và test liên quan; đối chiếu findings trong handoff orchestrator.

  ## CÁC TOOL/API CẦN CÓ
  Rà API tạo/xác nhận hold và response khi hết hạn; không sửa hoặc giả lập response để che finding. Dùng test/mock thời gian hiện có để đi qua expiration branch.

  ## KỊCH BẢN XỬ LÝ
  IF hold chưa hết hạn THEN xác nhận theo quy tắc hiện hành.
  IF hold quá 5 phút THEN cleanup không được che lỗi 410; API phải trả đúng trạng thái hết hạn.
  IF thông báo hoặc prompt nhắc TTL THEN nội dung phải là 5 phút.

  ## QUY TẮC NGHIỆP VỤ
  Không giữ slot quá hạn; không báo thời hạn 10 phút; kiểm tra cả nhánh thành công và lỗi, không chỉ test happy path.

  ## QUẢN LÝ INTENT VÀ STATE
  Giữ thông tin booking cần thiết để khách có thể chọn lại slot; không coi hold expired là booking confirmed.

  ## YÊU CẦU TRIỂN KHAI
  Ghi từng finding với file/nhánh/tái hiện; chuyển finding thành test adversarial và chỉ sửa sau khi root cause rõ.

  ## KẾT QUẢ MONG MUỐN
  Review nêu rõ lỗi, bằng chứng, mức ảnh hưởng và test xác nhận remediation; không xem kết quả suite chung là thay thế kiểm tra biên.
  ```
- **Kết quả AI trả về:** Handoff ghi review phát hiện phản hồi API còn nói “10 phút” và nhánh kiểm tra hết hạn trong `confirmHold()` bị cleanup chạy trước làm nhánh lỗi 410 không tới được. Bằng chứng tại [orchestrator/handoff.md](../.agents/teamwork/orchestrator/handoff.md).
- **Đánh giá:** Test tổng thể đã đạt nhưng vẫn bỏ lọt thông báo TTL cũ và nhánh hết hạn không thể tới được; đây là bằng chứng cụ thể rằng kiểm thử thiếu tình huống biên, không phải bằng chứng rằng không chạy test.
- **Điều chỉnh:** Các phát hiện được chuyển thành nhiệm vụ remediation ở lượt tiếp theo.
- **Bài học:** Test tổng thể đạt không thay thế review các nhánh lỗi và thông báo ở cấp nghiệp vụ.
- **Mẫu thất bại:** **F3 Chấp nhận mù**
- **Dấu hiệu nhận biết:** Báo cáo test đạt trước đó chưa phát hiện hai hành vi sai được reviewer tái kiểm tra.
- **Nguyên nhân gốc:** Theo handoff, test chưa bắt được phản hồi TTL không nhất quán và thứ tự xử lý expiration; đây là thiếu xác minh đúng nhánh, không phải bằng chứng rằng không hề chạy test.
- **Biện pháp phòng tránh:** Đưa slot hết hạn và thông báo API vào adversarial test; lượt 8 ghi nhận 17/17 test adversarial đạt sau remediation.

### Lượt 8 — Remediation lỗi review và Gemini quota · 30/10/2026 · Thành công

- **Bối cảnh & mục tiêu:** Sửa đúng các phát hiện Reviewer 1/Challenger 1 về thông báo TTL, lỗi hết hạn bị che và test provider phụ thuộc quota.
- **Prompt (biên tập theo cấu trúc yêu cầu từ [worker_remediation/DISPATCH.md](../.agents/teamwork/worker_remediation/DISPATCH.md); không phải nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – KHẮC PHỤC FINDING TTL VÀ TEST PROVIDER

  ## MỤC TIÊU
  Sửa chính xác finding của Reviewer 1/Challenger 1 về thông báo TTL, nhánh hold hết hạn và test Gemini phụ thuộc quota/network.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc findings/handoff, appointment repository/API `confirmHold()`, thông báo TTL, test Gemini và code xử lý quota/network.

  ## CÁC TOOL/API CẦN CÓ
  Dùng API hold/confirm hiện có, test runner và provider mock/fallback; response expiration phải giữ status/data theo contract hiện hành. Không gọi provider ngoài để làm test bắt buộc.

  ## KỊCH BẢN XỬ LÝ
  IF hold đã hết hạn THEN trả HTTP 410 và dữ liệu cần thiết để khách tiếp tục.
  IF hold còn hạn THEN giữ hành vi xác nhận hiện có.
  IF Gemini quota/network unavailable trong test THEN dùng fallback/mocking xác định, không treo suite.

  ## QUY TẮC NGHIỆP VỤ
  Mọi thông báo TTL ghi 5 phút; lỗi hết hạn không bị cleanup che; fallback test không được tạo kết quả thành công giả.

  ## QUẢN LÝ INTENT VÀ STATE
  Giữ booking context khi trả lỗi hết hạn để khách có thể chọn giờ khác; không mất dữ liệu cần thiết do cleanup.

  ## YÊU CẦU TRIỂN KHAI
  Sửa đúng findings, bổ sung adversarial/regression test, chạy các suite liên quan và toàn suite phù hợp; rà diff và ghi kết quả thực tế.

  ## KẾT QUẢ MONG MUỐN
  Các finding được tái hiện rồi xác nhận đã sửa; báo kết quả adversarial và tổng test, kèm mọi giới hạn còn lại.
  ```
- **Kết quả AI trả về:** Handoff điều phối ghi thông báo đổi sang 5 phút, `confirmHold()` trả lỗi 410 cùng dữ liệu giữ lại, test Gemini có fallback khi quota/network lỗi; kết quả được ghi là 17/17 adversarial và 140/140 test đạt.
- **Đánh giá:** Remediation nhắm trực tiếp vào findings và báo cáo ghi 17/17 adversarial cùng 140/140 test đạt; hồ sơ không xác nhận việc kiểm tra diff hoặc chạy test trực tiếp bởi người biên tập.
- **Điều chỉnh:** Tập trung vào các finding cụ thể thay vì yêu cầu chung “sửa cho đúng”; đây là cách làm được phản ánh trong prompt remediation.
- **Bài học:** Phản hồi review có vị trí lỗi, hành vi mong đợi và test xác nhận giúp sửa có mục tiêu.

### Lượt 9 — Chẩn đoán lỗi chọn giờ và conversation context · 31/10/2026 · Thành công sau sửa

- **Bối cảnh & mục tiêu:** Sửa hành vi chatbot đặt lịch khi khách chọn/đổi giờ, duy trì context và trả lời đúng vai trò.
- **Prompt (biên tập lại theo cấu trúc yêu cầu từ prompt gốc do người dùng cung cấp; không phải bản chép nguyên văn):**

  ```text
  # PROMPT BỔ SUNG – SỬA LỖI CHATBOT TƯ VẤN VÀ ĐẶT LỊCH SALON

  ## MỤC TIÊU
  Điều tra và sửa các lỗi chatbot AI tại trang chủ Salon dựa trên log hội thoại thực tế.

  Đồng thời, rà soát và chuẩn hóa System Prompt theo cấu trúc 6 thành phần:

  1. Vai trò (Role).
  2. Phạm vi (Scope).
  3. Quy tắc nghiệp vụ (Business Rules).
  4. Định dạng đầu ra (Output Format).
  5. Xử lý khi không chắc chắn (Uncertainty).
  6. Giới hạn (Constraints).
  Mục tiêu là giúp AI nhận diện đúng ý định khách hàng, tư vấn đúng dịch vụ, quản lý trạng thái hội thoại và thực hiện quy trình đặt lịch nhất quán.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc và đối chiếu log hội thoại thực tế, `database/data/categories.json`, `database/data/products.json`, dữ liệu lịch hẹn, conversation state, source chatbot và System Prompt hiện tại. Kiểm tra các test booking/context đang có trong `tests/`. Không tự suy diễn nguyên nhân nếu log hoặc dữ liệu không đủ.

  ## CÁC TOOL/API CẦN CÓ
  Kiểm tra các tool/API hiện có trước khi sửa:
  - Tra cứu dịch vụ/giá: nhận intent/tên dịch vụ và size nếu cần; trả dữ liệu từ catalog.
  - Kiểm tra lịch: nhận ngày, dịch vụ và thông tin bắt buộc; trả slot từ backend.
  - Giữ/xác nhận lịch: nhận state hợp lệ; trả kết quả backend, không tự xác nhận.
  - Provider chat: kiểm tra request/response, status, timeout/retry, tool call và định dạng.
  Ghi rõ input/output, lỗi có thể xảy ra và source gọi; không giả định API chưa tồn tại.

  ## KỊCH BẢN XỬ LÝ
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

  ### Các tình huống cần điều tra

  #### BUG 1: Nhận diện sai ý định khách hàng
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

  #### BUG 2: Phân loại size tóc không nhất quán
  Quy tắc size hiện tại:

  SizeĐịnh nghĩaSTóc từ cằm trở lênMTóc từ cằm đến ngang vaiLTóc từ ngang ngực trở xuốngYêu cầu:

  - Khách nói tóc ngang hông phải được phân loại size L.
  - Khách nói tóc hơn ngực phải được phân loại size L.
  - Khách nói tóc ngang vai phải được phân loại size M.
  - Khi khách sửa lại thông tin, phải cập nhật size mới.
  - Không hỏi lại size nếu mô tả đã đủ căn cứ xác định.
  - Không tự ý thay đổi quy tắc phân loại trong dữ liệu dự án.

  #### BUG 3: Mất trạng thái dịch vụ khi khách thay đổi giờ
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

  #### BUG 4: Thu thập thông tin không đúng thứ tự
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

  #### BUG 5: AI báo bận khi khách chọn dịch vụ
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

  ## QUY TẮC NGHIỆP VỤ
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

  ## QUẢN LÝ INTENT VÀ STATE
  - Phân biệt intent tư vấn, hỏi giá và đặt lịch; không tự chuyển sang booking chỉ vì khách nêu tên dịch vụ.
  - Lưu riêng dịch vụ được tư vấn và dịch vụ khách đã xác nhận cho booking.
  - Khi khách đổi ngày/giờ, chỉ cập nhật trường đó và giữ các thông tin đã xác nhận khác.
  - Khi khách đổi dịch vụ hoặc bắt đầu booking mới, cập nhật/xóa state phụ thuộc đúng phạm vi; không mang nhầm dữ liệu booking cũ.
  - Chỉ hỏi thông tin còn thiếu; ưu tiên yêu cầu mới của khách.

  ## YÊU CẦU TRIỂN KHAI
  Không chỉ đưa các quy tắc vào System Prompt rồi cho rằng lỗi đã được giải quyết.

  Cần phân biệt:

  - System Prompt: hướng dẫn hành vi và quy tắc phản hồi.
  - Backend: xử lý dữ liệu, trạng thái, nghiệp vụ và kiểm tra tính hợp lệ.
  - Tool calling: thực thi các thao tác với hệ thống.
  - Frontend: hiển thị phản hồi và thông báo lỗi.
  Nếu một quy tắc cần được đảm bảo tuyệt đối, phải kiểm tra và thực thi tại backend thay vì chỉ phụ thuộc vào AI.

  Không để System Prompt mâu thuẫn với logic backend.

  ---

  ### Kiểm thử sau khi sửa
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

  ## KẾT QUẢ MONG MUỐN
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
- **Đánh giá:** Prompt đặt quy trình điều tra trước khi sửa và nêu cụ thể tình huống tái hiện; báo cáo xác định sáu lỗi và ghi 22/22 test đạt sau sửa. Chưa có bằng chứng trong hồ sơ cho thấy người biên tập tự tái hiện hay chạy lại test.
- **Điều chỉnh:** Chuyển từ hướng dẫn chung sang quy trình tuần tự: đọc log, kiểm tra source/prompt, xác định nguyên nhân, lập kế hoạch rồi mới sửa và kiểm thử. Bộ test sau sửa bao phủ intent, duy trì state và luồng chọn/đổi slot.
- **Bài học:** Chatbot đặt lịch cần được kiểm tra như một quy trình nhiều lượt, không chỉ kiểm tra từng hàm riêng.

### Lượt 10 — Sửa UX website khách hàng và tài khoản · 31/10/2026 · Thất bại một phần

- **Bối cảnh & mục tiêu:** Chuẩn hóa điều hướng website khách, bổ sung trang tài khoản và sửa hành vi các nút tư vấn trên card dịch vụ.
- **Prompt (biên tập theo cấu trúc từ commit `3505d7b` và [báo cáo sửa lỗi website khách hàng](./fixbug/web_khach/bao-cao.md); không phải nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – CHUẨN HÓA UX WEBSITE KHÁCH HÀNG VÀ TÀI KHOẢN

  ## MỤC TIÊU
  Chuẩn hóa điều hướng website khách hàng, bổ sung trang đăng ký/đăng nhập/tài khoản và sửa nút tư vấn trên card dịch vụ để mở chat đúng ngữ cảnh.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Kiểm tra `public/index.html`, `public/products.html`, `public/product-detail.html`, `public/chat.html`, `public/js/chat.js`, auth API hiện có, test auth/appointments và báo cáo UX hiện tại.

  ## CÁC TOOL/API CẦN CÓ
  Dùng endpoint đăng ký/đăng nhập/đăng xuất hiện có; xác định request/response và lỗi xác thực. Nút tư vấn chỉ truyền dịch vụ/context đến chat UI hiện có; không thêm API backend nếu không cần.

  ## KỊCH BẢN XỬ LÝ
  IF khách chọn “Tư vấn ngay” trên card THEN mở chat với đúng dịch vụ làm context.
  IF khách chọn “Chi tiết” THEN mở trang chi tiết tương ứng.
  IF khách chọn đăng ký/đăng nhập THEN hiển thị đúng form/tab, trạng thái gửi và lỗi trường.
  IF truy cập URL form đặt lịch cũ THEN điều hướng theo luồng khách hiện tại.

  ## QUY TẮC NGHIỆP VỤ
  Đồng nhất menu desktop/mobile; không thay đổi API nghiệp vụ đặt lịch/admin ngoài phạm vi; không gửi form thật hoặc tạo dữ liệu khách thử nếu chưa được phép.

  ## QUẢN LÝ INTENT VÀ STATE
  Bảo toàn mã dịch vụ khi mở chat từ card; giữ trạng thái tab/form hợp lý; không để render/lọc card làm mất event handler hoặc context.

  ## YÊU CẦU TRIỂN KHAI
  Cập nhật các trang, JS/CSS và test liên quan; kiểm tra trình duyệt/viewport, auth test, redirect URL cũ, chatbot booking E2E và admin nếu thuộc phạm vi. Ghi rõ phần chưa kiểm tra.

  ## KẾT QUẢ MONG MUỐN
  Menu nhất quán, account UI hoạt động qua API hiện có, CTA card truyền đúng dịch vụ; báo file đổi, test pass/fail và luồng chưa xác minh.
  ```
- **Kết quả AI trả về:** Báo cáo [web_khach/bao-cao.md](./fixbug/web_khach/bao-cao.md) ghi các hạng mục UI đã cập nhật và một số test auth đạt. Tuy nhiên, `appointments.test.js` còn 4 assertion thất bại; báo cáo cũng ghi chưa kiểm tra gửi form thật, chatbot đặt lịch end-to-end và màn hình quản trị.
- **Đánh giá:** Phần UI có kết quả kiểm tra trình duyệt và một số test auth đạt, nhưng chưa thể coi toàn bộ hạng mục hoàn tất: bốn assertion đặt lịch vẫn thất bại và ba luồng (form thật, chatbot end-to-end, admin) chưa được kiểm tra.
- **Điều chỉnh:** Báo cáo giới hạn phạm vi, không thay API đặt lịch/admin và ghi rõ các kiểm tra còn thiếu; không có bằng chứng về lần sửa tiếp theo cho bốn assertion.
- **Bài học:** Cần chốt trước tiêu chí “hoàn thành” khi sửa UI nhưng test hồi quy liên quan nằm ở phần nghiệp vụ khác.
- **Mẫu thất bại:** **F11 Mắc kẹt ở "vòng 70%"**
- **Dấu hiệu nhận biết:** Một phần UI đã xong nhưng còn assertion và các luồng end-to-end chưa xác minh.
- **Nguyên nhân gốc:** Báo cáo cho biết phạm vi sửa giới hạn ở website khách, trong khi một số lỗi test thuộc nghiệp vụ đặt lịch và một số luồng chưa được chạy; đây là khoảng cách phạm vi/tiêu chí nghiệm thu.
- **Biện pháp phòng tránh:** Trước khi nghiệm thu cần lập ma trận phạm vi, chạy hồi quy liên quan và ghi rõ lỗi ngoài phạm vi cùng quyết định chấp nhận hay chưa; đây là khuyến nghị rút ra, hồ sơ chưa chứng minh đã áp dụng về sau.

## 4. Tổng kết

Trong 10 lượt đầu, các mẫu thất bại gồm **F3 Chấp nhận mù** (2 lượt), **F10 Nợ kỹ thuật vô hình** và **F11 Mắc kẹt ở "vòng 70%"**. Mục 7 phân tích thêm các lượt từ 01–06/11, gồm những lần test phụ thuộc Ollama, toàn suite chưa xanh/chưa chạy lại và luồng booking trả lỗi dù đã giữ slot. Đây là phân loại định tính các lượt được chọn, không đại diện thống kê cho mọi tin nhắn trong cache. Các kết quả kiểm thử khác nhau theo phạm vi; không suy diễn prompt nguyên văn hay kết quả không có bằng chứng.

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

> **Giới hạn bằng chứng:** 10 lượt đầu và 10 lượt bổ sung có prompt/yêu cầu, kết quả, đánh giá và điều chỉnh; nơi chỉ còn tóm tắt cache được ghi rõ. Các lượt thất bại được phân tích theo mẫu F3, F10 và F11. Các message event không tương đương nhiệm vụ độc lập. Đánh giá dựa trên hồ sơ kỹ thuật, không thay thế phần tự phản ánh cá nhân. Hồ sơ nguồn không ghi tên thành viên hay model AI cụ thể.

## 6. Khôi phục tương tác từ cache phiên · 31/10–07/11/2026

Các bản ghi được tìm thấy trong thư mục lưu phiên cục bộ Copilot (`session-state/<id>/events.jsonl`). Vì vậy, không có bằng chứng rằng các hội thoại này đã bị người dùng xóa; chúng chỉ chưa được đưa vào bản tổng hợp trước. Một số API liệt kê phiên chỉ trả metadata, nhưng file sự kiện cục bộ vẫn chứa prompt và phản hồi. Bảng dưới đây tổng hợp 62 message event theo phiên; nhiều câu hỏi nối tiếp được gộp theo chủ đề để tránh lặp, còn prompt dài được tóm tắt chứ không chép nguyên văn.

| Thời gian / phiên cache | Số message | Prompt/yêu cầu khôi phục được | Kết quả, đánh giá và điều chỉnh theo log |
|---|---:|---|---|
| 31/10 · `65ef27b0` | 8 | Lỗi chạy npm trên PowerShell; thiếu `dotenv`; AI chưa cấu hình; tạo `.env`; yêu cầu điều tra lỗi AI khi chọn Duỗi mái; sửa tư vấn cắt tóc; sửa tra giá từ JSON; điều tra mất ngữ cảnh khi tư vấn/đặt lịch. | Hướng dẫn chuyển sang `npm.cmd`, cài dependency và cấu hình môi trường. Các lỗi chatbot được điều tra/sửa theo từng yêu cầu; prompt đầu tiên yêu cầu chỉ phân tích trước, không sửa ngay. Phản hồi có cảnh báo cấu hình bí mật cần xử lý an toàn. |
| 31/10–02/11 · `d65e9777` | 10 | “Tiếp tục”; các kịch bản booking chưa chọn dịch vụ, ưu tiên nhu cầu dịch vụ, booking bỏ qua nhu cầu đã nêu, kết thúc phiên và follow-up vẫn hỏi sai; lỗi nhận số điện thoại/tên; lỗi không nhận ý định đặt lịch; điều tra lỗi từ log thực tế. | Lượt “tiếp tục” không có đủ ngữ cảnh và trợ lý đã yêu cầu nêu rõ phần cần tiếp tục. Các phần sửa booking/context được kiểm tra theo suite mục tiêu: có báo cáo 43/43, 54/54 và 46/46 đạt ở các lượt khác nhau. Báo cáo điều tra cuối ghi rõ chưa thể xác nhận nguyên nhân provider nếu thiếu runtime log. |
| 01/11 · `270047ef` | 6 | Điều tra 4 test lỗi trong bộ AI booking; hỏi timeout phiên/TTL giữ chỗ; hỏi lệnh chạy dự án; hỏi nơi backend kiểm tra giờ; yêu cầu kiểm tra dữ liệu giờ 14:00; đổi bước giờ từ 45 phút xuống 1 phút. | Kiểm tra báo test chịu ảnh hưởng Ollama ngoại tuyến nhưng fallback giữ suite; các câu hỏi timeout/lệnh chạy được trả lời theo cấu hình. Yêu cầu đổi bước giờ dẫn tới chỉnh lịch và báo cáo 24/24 test đạt. CSDL được đối chiếu để trả lời giờ trống, không suy đoán ngoài dữ liệu lưu. |
| 02/11 · `faa10715` | 1 | Yêu cầu phân tích kiến trúc AI hiện tại. | Phản hồi yêu cầu thêm bối cảnh triển khai, tải, độ trễ/chi phí và quy mô catalog để kết luận kiến trúc phù hợp; đây là phân tích sơ bộ, không phải thay đổi code. |
| 04/11 · `97e0b000` | 6 | Ba câu hỏi/câu lệnh lấy code từ `main`; yêu cầu lập nhật ký MIS3047 dựa trên bằng chứng; cung cấp tài liệu bổ sung; gửi prompt điều tra và chuẩn hóa system prompt AI. | Cập nhật nhánh thành công. Nhật ký ban đầu được tạo từ hồ sơ, nhưng còn thiếu prompt/đánh giá cá nhân nên phải bổ sung. Prompt chatbot yêu cầu điều tra trước, rồi mới sửa và kiểm thử; nó trùng chủ đề với Lượt 9 ở trên và không được cộng thành nhiệm vụ mới. |
| 04/11 · `973348ec` | 5 | Sửa một chuỗi dữ liệu lỗi mã hóa; rà các trường lỗi tương tự; điều tra chatbot tư vấn/đặt lịch uốn tóc; cung cấp system prompt 6 phần; điều tra lỗi chuyển từ tư vấn sang booking. | Dữ liệu được sửa và rà soát JSON. Báo cáo uốn tóc tìm nguyên nhân ở phân giải dịch vụ/state và chuẩn hóa prompt; lần chạy toàn suite ghi 227/231, các test liên quan được sửa nhưng chưa chạy lại toàn suite. Báo cáo chuyển booking ghi 75/75 test mục tiêu đạt, chưa chạy toàn suite. |
| 05/11 · `f3dcbd5a` | 6 | Lỗi không hiểu độ dài tóc/không chuyển chuyên viên; bổ sung nhận diện tên dịch vụ tự nhiên; hoàn thiện 4 kịch bản booking bằng CSDL; push/pull nhánh; lỗi lặp vô hạn ở bước xác nhận. | Một lần chạy toàn suite ghi 242/244; hai test timeout/hold fail trong tích hợp nhưng đạt khi chạy riêng. Một nhóm hồi quy khác ghi 48/48 đạt. Kịch bản nhân viên bị giới hạn bởi dữ liệu ca làm chưa có. Các thao tác Git được thực hiện; bug xác nhận được sửa và kiểm tra cú pháp/diff. |
| 05–06/11 · `2e77c2af` | 17 | Lấy code `main`; lỗi hỏi lại dịch vụ khi tra lịch trống; một tin “hello”; lỗi mất dịch vụ/lặp xác nhận; hiển thị khoảng giờ trống; ngày tháng không nhận; trả lời lạc chủ đề/lộ dữ liệu nội bộ; đổi tên dịch vụ ART; bổ sung mô tả dịch vụ; kiểm tra/tạo nhánh, push/pull, hỏi về changes và dữ liệu giả. | Các lỗi booking được điều tra/sửa theo nhiều bước, giữ service/state và xác nhận theo dữ liệu; các thay đổi catalog được kiểm tra. Một yêu cầu đầu tiên ở chuỗi này kết thúc lỗi trước khi có phản hồi hoàn tất; các yêu cầu sau được đưa vào remediation và kiểm tra theo báo cáo. Các lệnh Git hoàn thành từng bước. Không dùng lượt “hello” hay thao tác Git như bằng chứng của nhiệm vụ kỹ thuật độc lập. |
| 06–07/11 · `d6938224` | 3 | Yêu cầu mục 4.2 với tối thiểu 10 lượt; yêu cầu cộng tổng và tổng hợp hết; hỏi các lượt 31/10 đến nay có bị xóa hay chưa tổng hợp, có cache khôi phục được không. | Bản nháp 10 lượt đã tạo, nhưng câu trả lời tổng 27 sau đó sai do đếm checkpoint Git thay cho chat và bỏ sót cache. Lượt hiện tại tìm được cache cục bộ, xác nhận nhiều nội dung chưa tổng hợp và sửa lại cách đếm. |

### Cách tính và giới hạn

- **62** là tổng message event có nội dung người dùng trong 9 bản ghi phiên cache thuộc workspace, từ 31/10 đến 07/11; đã loại một side-chat không thuộc nhật ký dự án.
- Đây không phải 62 nhiệm vụ đáng chú ý riêng: có câu hỏi follow-up, lệnh Git, thông báo terminal và một tin “hello”. 10 lượt ban đầu ở mục 3 và 10 lượt bổ sung ở mục 7 là các nhiệm vụ chọn lọc từ cache; bảng này ghi nhận phạm vi cache theo phiên.
- Không cộng 10 dòng nhiệm vụ chi tiết hoặc dispatch worker/reviewer vào 62 vì có phần trùng cùng prompt/chuỗi công việc. Số **27** ở bản trước cần bỏ, không dùng làm tổng.
- Cache giữ được prompt và phản hồi cho các phiên đã liệt kê. Một phần prompt/kết quả được tóm tắt ở đây để tránh lặp nguyên văn dài; không có bằng chứng về việc người dùng xóa cache. Nếu cần đối chiếu nguyên văn, nguồn là các file `events.jsonl` trong session-state cục bộ.

## 7. Nhật ký 10 lượt mới · 01–06/11/2026

> **Cách ghi:** Mỗi prompt dưới đây được viết đầy đủ, dựa trên nội dung khôi phục từ cache phiên ngày 01–06/11. Do cache/báo cáo không còn nguyên văn tất cả prompt, các khối được ghi là **diễn đạt lại, không phải trích nguyên văn**. Các số test là kết quả báo cáo/handoff, không phải kết quả chạy lại khi biên tập nhật ký. “Điều chỉnh đề xuất” không khẳng định là thao tác đã thực hiện.

### Lượt 11 — Điều tra bốn test AI booking lỗi · 01/11/2026 · Thất bại một phần

- **Prompt (biên tập theo cấu trúc; diễn đạt lại từ cache, không nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – ĐIỀU TRA BỐN TEST AI BOOKING LỖI
  ## MỤC TIÊU
  Xác định nguyên nhân bốn test AI booking lỗi, phân biệt lỗi code với lỗi môi trường/provider và đưa hướng xử lý có bằng chứng.
  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc output test, test AI booking, cấu hình/provider Ollama và log liên quan; không suy đoán khi không có log.
  ## CÁC TOOL/API CẦN CÓ
  Dùng test runner hiện có và provider mock/fallback nếu đã hỗ trợ; ghi rõ input, output, lỗi và provider được gọi.
  ## KỊCH BẢN XỬ LÝ
  IF test fail THEN tái hiện riêng, ghi test/error; IF provider offline THEN tách lỗi dependency khỏi lỗi logic; sau đó chạy lại test cần thiết.
  ## QUY TẮC NGHIỆP VỤ
  Không đánh dấu pass giả bằng cách bỏ qua assertion; không tuyên bố đã sửa nếu chưa có lần chạy xác nhận.
  ## QUẢN LÝ INTENT VÀ STATE
  Giữ fixture/conversation độc lập để dữ liệu test không làm nhiễu kết quả giữa các case.
  ## YÊU CẦU TRIỂN KHAI
  Điều tra trước, sửa đúng nguyên nhân, chạy test liên quan và ghi cụ thể test nào chưa thể chạy.
  ## KẾT QUẢ MONG MUỐN
  Báo bốn test, nguyên nhân từng test, bằng chứng, thay đổi và kết quả chạy lại; phân biệt mock với provider thật.
  ```
- **Kết quả AI trả về:** Log ghi nhận môi trường Ollama ngoại tuyến ảnh hưởng các test gọi AI; có cơ chế fallback để suite tiếp tục. Cache không lưu kết quả chạy lại riêng từng test sau chẩn đoán.
- **Đánh giá:** Chỉ ra được yếu tố môi trường nhưng chưa chứng minh hành vi với provider thật hoặc kết quả của cả bốn test. Mẫu liên quan là **F10 — Nợ kỹ thuật vô hình**: phụ thuộc dịch vụ ngoài khiến kết quả test thay đổi theo môi trường, khó phân biệt lỗi code với lỗi hạ tầng.
- **Điều chỉnh:** Tách kiểm thử logic booking khỏi provider thật bằng mock/fallback có kiểm soát; ghi rõ test nào được bỏ qua hoặc chạy với provider giả. Hồ sơ hiện có chưa xác nhận cả bốn test đã được chạy lại riêng.

### Lượt 12 — Đổi bước chọn giờ từ 45 phút xuống 1 phút · 01/11/2026 · Thành công theo test mục tiêu

- **Prompt (biên tập theo cấu trúc; diễn đạt lại từ cache, không nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – ĐIỀU CHỈNH BƯỚC KHUNG GIỜ
  ## MỤC TIÊU
  Đổi bước thời gian khung giờ có thể chọn từ 45 phút thành 1 phút mà không vượt giờ hoạt động.
  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc cấu hình giờ hoạt động, logic tạo slot, kiểm tra availability và test lịch hiện có.
  ## CÁC TOOL/API CẦN CÓ
  Dùng API/backend tạo và kiểm tra slot; input là ngày/dịch vụ, output là các slot hợp lệ từ lịch thực tế.
  ## KỊCH BẢN XỬ LÝ
  IF tạo danh sách giờ THEN tăng theo từng phút trong khoảng hợp lệ; IF thời điểm ngoài giờ/đã kín THEN không đề xuất slot đó.
  ## QUY TẮC NGHIỆP VỤ
  Không thay đổi giờ mở/đóng cửa hay quy tắc booking khác; không tự tuyên bố slot còn trống nếu backend chưa xác nhận.
  ## QUẢN LÝ INTENT VÀ STATE
  Giữ ngày/dịch vụ đã chọn khi khách đổi giờ; chỉ cập nhật giờ khách yêu cầu.
  ## YÊU CẦU TRIỂN KHAI
  Cập nhật logic tạo slot và test biên đầu/cuối giờ, bước phút, ngày và slot không khả dụng.
  ## KẾT QUẢ MONG MUỐN
  Slot được tạo với bước 1 phút và tuân thủ lịch salon; báo test mục tiêu và phạm vi suite đã chạy.
  ```
- **Kết quả AI trả về:** Báo cáo phiên ghi nhận thay đổi bước giờ và kết quả **24/24 test** đạt.
- **Đánh giá:** Kết quả test mục tiêu phù hợp với thay đổi được yêu cầu; hồ sơ không cho biết toàn bộ suite có được chạy cùng lượt hay không.
- **Điều chỉnh đề xuất:** Kiểm tra cả biên giờ làm việc và khả năng đặt một giờ cụ thể; cache không ghi nhận suite toàn hệ thống được chạy sau thay đổi nên không suy rộng 24/24 thành xác nhận toàn hệ thống.

### Lượt 13 — Phân tích kiến trúc AI hiện tại · 02/11/2026 · Phân tích sơ bộ

- **Prompt (biên tập theo cấu trúc; diễn đạt lại từ cache, không nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – PHÂN TÍCH KIẾN TRÚC AI
  ## MỤC TIÊU
  Mô tả kiến trúc AI hiện tại, quan hệ giữa các thành phần, điểm mạnh/yếu và những câu hỏi cần trả lời trước khi đề xuất thay đổi.
  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc source AI/provider/orchestrator, cấu hình, tool calling, dữ liệu catalog và tài liệu dự án hiện có.
  ## CÁC TOOL/API CẦN CÓ
  Liệt kê provider, tool/API, input/output và luồng gọi dựa trên source; không giả định hệ thống có công cụ chưa thấy trong repo.
  ## KỊCH BẢN XỬ LÝ
  Theo dõi request từ frontend qua backend/orchestrator/provider/tool đến response; ghi rõ fallback và nhánh lỗi.
  ## QUY TẮC NGHIỆP VỤ
  Tách dữ kiện trong source khỏi suy luận; không kết luận phù hợp cho production khi thiếu tải, latency, cost và yêu cầu vận hành.
  ## QUẢN LÝ INTENT VÀ STATE
  Mô tả nơi lưu conversation/booking state và cách state được chuyển qua các lượt; nêu điểm chưa rõ.
  ## YÊU CẦU TRIỂN KHAI
  Chỉ phân tích, không sửa code nếu chưa được yêu cầu; thu thập câu hỏi về môi trường, tải và catalog khi thiếu.
  ## KẾT QUẢ MONG MUỐN
  Báo sơ đồ/thành phần, ưu nhược điểm, rủi ro và dữ liệu cần bổ sung trước khuyến nghị.
  ```
- **Kết quả AI trả về:** Phản hồi nêu cần thêm thông tin về môi trường triển khai, tải, độ trễ/chi phí và quy mô danh mục trước khi kết luận kiến trúc phù hợp.
- **Đánh giá:** Không đưa ra khuyến nghị chắc chắn khi thiếu dữ liệu vận hành; đây là giới hạn hợp lý. Prompt ban đầu chưa cung cấp tiêu chí để so sánh lựa chọn.
- **Điều chỉnh đề xuất:** Bổ sung bối cảnh triển khai và các ngưỡng tải/độ trễ/chi phí trước khi yêu cầu đề xuất; đây là bước cần làm tiếp, không phải thay đổi code đã được xác nhận.

### Lượt 14 — Sửa chuỗi dữ liệu lỗi mã hóa và rà trường liên quan · 04/11/2026 · Thành công có giới hạn bằng chứng

- **Prompt (biên tập theo cấu trúc; diễn đạt lại từ cache, không nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – SỬA VÀ RÀ DỮ LIỆU LỖI MÃ HÓA
  ## MỤC TIÊU
  Sửa chuỗi bị lỗi mã hóa để hiển thị đúng tiếng Việt và tìm các trường cùng loại có lỗi xác định được.
  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc file dữ liệu nguồn và schema/usage của trường; kiểm tra git diff trước khi sửa để bảo toàn thay đổi khác.
  ## CÁC TOOL/API CẦN CÓ
  Dùng parser/validator JSON và kiểm tra encoding hiện có; input là file/field, output là dữ liệu hợp lệ và báo cáo trường đã rà.
  ## KỊCH BẢN XỬ LÝ
  IF chuỗi sai được xác định THEN sửa đúng giá trị; IF gặp chuỗi đáng ngờ nhưng chưa đủ căn cứ THEN ghi nhận, không tự thay.
  ## QUY TẮC NGHIỆP VỤ
  Không sửa hàng loạt mù; giữ nguyên cấu trúc/schema và các thay đổi không liên quan.
  ## QUẢN LÝ INTENT VÀ STATE
  Không áp dụng thay đổi sang dữ liệu hội thoại/khách hàng khác ngoài phạm vi đã xác định.
  ## YÊU CẦU TRIỂN KHAI
  Sửa dữ liệu tối thiểu, rà trường tương tự, validate JSON và kiểm tra diff.
  ## KẾT QUẢ MONG MUỐN
  Báo giá trị/field đã sửa, phạm vi rà, kết quả validation và các trường chưa thể kết luận.
  ```
- **Kết quả AI trả về:** Cache ghi nhận chuỗi được sửa và các trường dữ liệu liên quan được rà soát.
- **Đánh giá:** Phạm vi xử lý có bước rà rộng hơn một giá trị đơn lẻ; không thấy báo cáo riêng về số trường đã kiểm tra hoặc kiểm thử hiển thị.
- **Điều chỉnh đề xuất:** Dùng kiểm tra JSON/Unicode và đối chiếu dữ liệu trước-sau; ghi nhận phạm vi rà soát thay vì chỉ xác nhận sửa một chuỗi. Cache không có báo cáo riêng về những bước xác minh này.

### Lượt 15 — Điều tra lỗi tư vấn và đặt lịch dịch vụ uốn tóc · 04/11/2026 · Thất bại một phần

- **Prompt (biên tập theo cấu trúc; diễn đạt lại từ cache, không nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – ĐIỀU TRA CHATBOT TƯ VẤN VÀ ĐẶT LỊCH UỐN TÓC
  ## MỤC TIÊU
  Tìm nguyên nhân chatbot hỏi chi tiết không thuộc quy trình, không nhận tên dịch vụ tự nhiên, mất service khi booking và hỏi lặp.
  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đối chiếu log, categories/products, System Prompt, conversation/booking state, source pricing/orchestrator và test liên quan.
  ## CÁC TOOL/API CẦN CÓ
  Rà tool tra catalog/giá, kiểm tra lịch, giữ slot và provider; xác định input/output thực tế, không bịa tool/API.
  ## KỊCH BẢN XỬ LÝ
  IF tên dịch vụ chính xác THEN ánh xạ dịch vụ có thật; IF chỉ nêu nhóm uốn tóc THEN đưa lựa chọn catalog; IF booking đang tiếp diễn THEN không hỏi lại dịch vụ đã xác nhận.
  ## QUY TẮC NGHIỆP VỤ
  Không hỏi thông tin ngoài quy trình, không tự chọn dịch vụ, size, giá hoặc slot; tuân thủ dữ liệu salon.
  ## QUẢN LÝ INTENT VÀ STATE
  Tách tư vấn với booking-confirmed service; giữ service khi khách thêm ngày/giờ; chỉ đổi service khi khách nêu lựa chọn mới.
  ## YÊU CẦU TRIỂN KHAI
  Báo root cause trước khi sửa; cập nhật prompt/backend nếu cần; viết test catalog, state, booking và đầu ra; chạy suite mục tiêu và toàn suite nếu khả thi.
  ## KẾT QUẢ MONG MUỐN
  Báo nguyên nhân, file/hàm, test pass/fail và giới hạn. Không tuyên bố hoàn tất toàn bộ khi chưa xác nhận hồi quy.
  ```
- **Kết quả AI trả về:** [Báo cáo điều tra uốn tóc](./fixbug/chatbot-uon-toc-dat-lich.md) xác định các nguyên nhân ở phân giải tên dịch vụ, cập nhật booking state và chỉ dẫn prompt chồng lặp. Một lần chạy toàn bộ ghi **227/231 đạt**; sau khi cập nhật kỳ vọng test cũ, các suite liên quan đạt **12/12**, nhưng không chạy lại toàn bộ suite. Một test khác nhận HTTP 409 do slot đã bị chiếm trong dữ liệu test.
- **Đánh giá:** Có chẩn đoán nguyên nhân và test đích, nhưng chưa xác nhận toàn bộ hồi quy sau chỉnh sửa. Đây là **F11 — Mắc kẹt ở "vòng 70%"**: phần sửa chính đã tiến triển, nhưng còn test tích hợp chưa ổn định và bước xác nhận cuối bị bỏ dở.
- **Nguyên nhân gốc của phần chưa đạt:** Ba test dùng kỳ vọng cũ về việc hỏi dịch vụ phải gọi LLM; test còn lại tranh chấp slot với dữ liệu dùng chung. Suite toàn bộ không được chạy lại sau khi sửa kỳ vọng.
- **Điều chỉnh:** Cập nhật test theo hành vi catalog-first, cô lập dữ liệu/slot trong test tích hợp và chạy lại toàn suite trước khi kết luận hoàn tất. Báo cáo ghi rõ toàn suite chưa được xác nhận xanh.

### Lượt 16 — Chuẩn hóa System Prompt theo sáu phần · 04/11/2026 · Đạt test mục tiêu, còn giới hạn

- **Prompt (biên tập theo cấu trúc yêu cầu; diễn đạt lại từ cache, không phải nguyên văn):**

  ```text
  # PROMPT BỔ SUNG – CHUẨN HÓA SYSTEM PROMPT VÀ CHẶN NỘI DUNG NỘI BỘ

  ## MỤC TIÊU
  Điều tra và sửa lỗi chatbot trả nội dung lạc đề, hướng dẫn nội bộ hoặc nhãn vai trò như “assistant” cho khách hàng. Chuẩn hóa System Prompt theo sáu phần: Vai trò, Phạm vi, Quy tắc nghiệp vụ, Định dạng đầu ra, Xử lý khi không chắc chắn và Giới hạn. Bảo đảm thay đổi được kiểm chứng bằng test, không chỉ báo cáo đã chỉnh prompt.

  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Trước khi sửa, đọc và đối chiếu:
  - `database/data/system_settings.json` và `src/config/jsonStore.js` để xác định prompt đang hoạt động và prompt mặc định.
  - `database/data/categories.json`, `database/data/products.json` để xác định dữ liệu dịch vụ/giá mà chatbot được phép dùng.
  - `database/data/messages.json`, `database/data/conversations.json` để kiểm tra hội thoại lỗi và state liên quan.
  - Mã nguồn xây dựng prompt, điều phối hội thoại, lưu lịch sử và xử lý đầu ra trong `src/ai/`, `src/repositories/` và `src/routes/`.
  - Các test hiện có về prompt, hội thoại, intent, booking và định dạng phản hồi.
  Không suy đoán nội dung không có trong dữ liệu; không đưa thông tin nhạy cảm hoặc toàn bộ prompt nội bộ vào log/báo cáo khách hàng.

  ## CÁC TOOL/API CẦN CÓ
  Kiểm tra các tool/API hiện có trước khi sửa; không tự tạo tên tool mới nếu dự án chưa hỗ trợ:
  - Tra cứu danh mục/dịch vụ: nhận từ khóa hoặc intent; trả về dịch vụ đang hoạt động cùng mô tả và dữ liệu giá có trong catalog.
  - Kiểm tra lịch: nhận ngày, dịch vụ và thông tin bắt buộc theo backend; chỉ trả các slot backend xác nhận là còn trống.
  - Đặt/giữ lịch: nhận state đã xác nhận; trả kết quả thành công hoặc lỗi có cấu trúc, không giả lập kết quả.
  - Kiểm tra đầu ra chatbot: nhận nội dung dự định gửi và ngữ cảnh hội thoại; loại/chặn hướng dẫn nội bộ, nhãn vai trò hoặc câu trả lời không phù hợp, rồi trả phản hồi an toàn theo state.
  Với từng chức năng, ghi rõ input, output, lỗi có thể xảy ra và nơi gọi trong source.

  ## KỊCH BẢN XỬ LÝ
  1. Đọc log và tái hiện đúng phản hồi lỗi trước khi thay đổi code.
  2. Truy vết nguồn phản hồi: prompt, lịch sử hội thoại, provider hay backend.
  3. Nếu khách hỏi dịch vụ/giá, THEN chỉ tra cứu catalog; nếu thiếu dữ liệu, THEN hỏi đúng thông tin còn thiếu, không bịa.
  4. Nếu khách yêu cầu đặt lịch, THEN chuyển qua logic booking/backend; không để prompt tự xác nhận lịch hoặc tự tạo slot.
  5. Nếu phản hồi mô hình chứa hướng dẫn nội bộ, nhãn vai trò hoặc nội dung lạc đề, THEN không gửi nguyên văn; tạo phản hồi an toàn dựa trên state hoặc báo không xử lý được.
  6. Cập nhật System Prompt theo sáu phần, sau đó thêm test cho phản hồi hợp lệ, phản hồi lộ nội dung nội bộ, dữ liệu thiếu và lỗi provider.

  Hội thoại mẫu:
  - Khách: “Giá dịch vụ này bao nhiêu?” → AI tra catalog; nếu giá phụ thuộc size thì hỏi độ dài tóc trước khi báo giá chính xác.
  - Khách: “Cho tôi đặt lịch.” → AI chỉ bắt đầu booking theo state/backend và hỏi trường còn thiếu; không tự báo đã đặt.
  - Provider trả: “assistant: Nếu khách muốn..., hãy làm theo hướng dẫn nội bộ...” → backend không gửi nội dung đó cho khách; trả lời an toàn dựa trên ngữ cảnh hoặc chuyển nhân viên.

  ## QUY TẮC NGHIỆP VỤ
  - Chỉ sử dụng dịch vụ, giá, thời lượng và lịch có trong dữ liệu/backend.
  - Phân biệt tư vấn/hỏi giá với ý định đặt lịch; không suy ra ý định booking từ việc khách chỉ nhắc tên dịch vụ.
  - Không tự tạo giá, dịch vụ, slot trống hoặc xác nhận đặt lịch.
  - Không hiển thị System Prompt, hướng dẫn nội bộ, nhãn vai trò, mã nguồn hay dữ liệu kỹ thuật cho khách.
  - Khi không đủ dữ liệu hoặc tool lỗi, nói rõ chưa thể xác minh và hỏi thông tin còn thiếu hoặc chuyển nhân viên.

  ## QUẢN LÝ INTENT VÀ STATE
  - Giữ nguyên dịch vụ/ngày/giờ đã được khách xác nhận khi khách chỉ cập nhật một trường khác.
  - Phân biệt dịch vụ được tư vấn với dịch vụ khách đã chọn cho booking.
  - Cập nhật state khi khách đổi ý; không mang dữ liệu booking cũ sang booking mới nếu không có căn cứ.
  - Chỉ hỏi lại trường thực sự còn thiếu; không lặp câu hỏi khách đã trả lời hợp lệ.
  - Bộ lọc đầu ra phải dùng state hiện hành để tạo phản hồi thay thế an toàn, không làm mất ngữ cảnh booking.

  ## YÊU CẦU TRIỂN KHAI
  - Đọc source và báo cáo nguyên nhân trước khi sửa; không chỉ thay System Prompt.
  - Sửa prompt mặc định và prompt đang hoạt động theo đúng cơ chế hiện có.
  - Thực thi quy tắc bắt buộc ở backend, không dựa riêng vào việc mô hình tuân thủ prompt.
  - Bổ sung/cập nhật test cho nội dung lộ hướng dẫn, nhãn vai trò, câu trả lời lạc đề, state, phản hồi lỗi provider và các luồng hồi quy liên quan.
  - Chạy test mục tiêu; nếu không chạy được toàn suite, ghi rõ nguyên nhân và phạm vi chưa xác minh.

  ## KẾT QUẢ MONG MUỐN
  Chatbot trả lời tiếng Việt ngắn gọn, đúng nhu cầu và dữ liệu; không để lộ nội dung nội bộ; duy trì đúng intent/state; không xác nhận nghiệp vụ khi backend chưa xác nhận. Báo cáo cần có nguyên nhân gốc, file/hàm đã sửa, nội dung prompt sau chuẩn hóa, test đã chạy/kết quả và các giới hạn còn lại.
  ```
- **Kết quả AI trả về:** Prompt được chuẩn hóa thành vai trò, phạm vi, quy tắc nghiệp vụ, định dạng đầu ra, xử lý không chắc chắn và giới hạn. Báo cáo ghi **38/38** test tập trung đạt; sau đó các suite chịu ảnh hưởng đạt **12/12**. Logic backend cũng lọc hướng dẫn nội bộ/nhãn vai trò thay vì chỉ dựa vào prompt.
- **Đánh giá:** Cách sửa bao gồm prompt và backend, phù hợp với yêu cầu không chỉ đổi câu chữ. Tuy nhiên, không có kiểm thử trực tiếp với provider LLM bên ngoài và toàn suite ở lượt này vẫn ghi 227/231, chưa chạy lại sau cập nhật test.
- **Điều chỉnh đề xuất:** Duy trì test cấu trúc prompt và phản hồi khách hàng; bổ sung kiểm tra bằng provider thật sau khi có môi trường, đồng thời chạy lại toàn suite trong môi trường test cô lập.

### Lượt 17 — Sửa luồng tư vấn sang booking bị trả lỗi sau khi giữ slot · 04–05/11/2026 · Thành công sau điều tra

- **Prompt (biên tập theo cấu trúc; diễn đạt lại từ cache và báo cáo, không nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – SỬA LỖI BOOKING TRẢ FALLBACK SAU KHI GIỮ SLOT
  ## MỤC TIÊU
  Điều tra tình huống khách hỏi “uốn mái”, đặt 14:00 ngày mai nhưng nhận lỗi dù hold đã được tạo; sửa luồng để không tạo side effect rồi báo thất bại chung.
  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc messages/conversations/appointments, products, conversationContext, orchestrator, tools, appointment service/repository và runtime log nếu có.
  ## CÁC TOOL/API CẦN CÓ
  Rà API check availability, hold, confirm và provider. Ghi input/output/error code; không quy lỗi cho provider nếu chưa có log chứng minh.
  ## KỊCH BẢN XỬ LÝ
  IF thiếu size để định giá THEN hỏi size và chưa giữ slot; IF dữ liệu booking hợp lệ THEN kiểm tra availability rồi hold; IF thiếu liên hệ sau hold THEN backend hỏi trực tiếp; IF API lỗi THEN trả lỗi phù hợp, giữ state và không báo thành công.
  ## QUY TẮC NGHIỆP VỤ
  Không dùng giá size mặc định, không giữ slot khi thiếu dữ liệu bắt buộc, không phụ thuộc LLM chỉ để hỏi bước booking xác định.
  ## QUẢN LÝ INTENT VÀ STATE
  Giữ dịch vụ/ngày/giờ đã xác nhận; khi đổi service xóa dữ liệu phụ thuộc cũ nhưng giữ trường còn hợp lệ; không làm mất context khi tool lỗi.
  ## YÊU CẦU TRIỂN KHAI
  Truy vết trước khi sửa; bổ sung test cho size, đổi giờ/service, slot kín, availability error, hold và phản hồi không gọi LLM.
  ## KẾT QUẢ MONG MUỐN
  Không còn hold ẩn sau thông báo lỗi; phản hồi phản ánh đúng backend; báo test, log giới hạn và các trường hợp chưa xác minh.
  ```
- **Kết quả AI trả về:** Phân tích state và dữ liệu cho thấy dịch vụ/ngày/giờ đã được lưu, slot đã bị giữ nhưng nhánh backend trả `null` khi thiếu thông tin liên hệ; orchestrator tiếp tục gọi provider và trả fallback. Báo cáo không kết luận được loại lỗi provider cụ thể vì thiếu runtime log. Bản sửa trả phản hồi tiếp theo trực tiếp từ backend, yêu cầu size khi cần trước khi giữ slot và tránh giá size mặc định. Bộ test mục tiêu ghi **75/75 đạt**.
- **Đánh giá:** Đây là lỗi nghiêm trọng về tính nhất quán: khách thấy lỗi trong khi hệ thống đã giữ slot. Mẫu liên quan là **F3 — Chấp nhận mù**: nếu chỉ đánh giá câu trả lời hiển thị mà không đối chiếu state/hold, có thể bỏ qua side effect đã xảy ra.
- **Nguyên nhân gốc:** Giá trị `null` vừa được dùng cho trường hợp chưa có phản hồi booking, vừa khiến luồng rơi về LLM; sau đó lỗi provider bị đổi thành fallback chung. Thiếu log runtime cũng khiến không xác định được subtype lỗi.
- **Điều chỉnh:** Trả lời bước booking còn thiếu bằng backend, không gọi LLM chỉ để hỏi thông tin; không giữ slot nếu thiếu size bắt buộc; thêm log an toàn và test cho availability, đổi giờ/dịch vụ, slot kín và size.

### Lượt 18 — Sửa vòng lặp xác nhận đặt lịch · 05/11/2026 · Sửa được nhưng hồi quy chưa ổn định

- **Prompt (biên tập theo cấu trúc; diễn đạt lại từ cache, không nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – SỬA VÒNG LẶP XÁC NHẬN BOOKING
  ## MỤC TIÊU
  Tái hiện và sửa lỗi chatbot lặp vô hạn khi xác nhận đặt lịch, bảo đảm hội thoại chuyển sang bước kế tiếp.
  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc log hội thoại, intent/state, nhánh xác nhận trong orchestrator, API booking và test timeout/hold.
  ## CÁC TOOL/API CẦN CÓ
  Kiểm tra API xác nhận/hold và provider/tool response; ghi rõ input/output và trạng thái sau mỗi lượt.
  ## KỊCH BẢN XỬ LÝ
  IF khách xác nhận hợp lệ THEN thực hiện đúng bước kế tiếp một lần; IF dữ liệu còn thiếu THEN chỉ hỏi trường thiếu, không lặp xác nhận đã nhận.
  ## QUY TẮC NGHIỆP VỤ
  Không tạo booking hai lần; không báo thành công nếu backend chưa xác nhận; không bỏ qua lỗi hold/timeout.
  ## QUẢN LÝ INTENT VÀ STATE
  Cập nhật state sau mỗi xác nhận; chống xử lý lặp cùng sự kiện và giữ thông tin đã xác nhận hợp lệ.
  ## YÊU CẦU TRIỂN KHAI
  Sửa root cause, viết test hội thoại nhiều lượt, chạy riêng và trong suite tích hợp để so sánh.
  ## KẾT QUẢ MONG MUỐN
  Hội thoại thoát vòng lặp; báo lỗi còn lại nếu test riêng/tích hợp khác nhau, không suy rộng từ suite mục tiêu.
  ```
- **Kết quả AI trả về:** Cache ghi nhận lỗi được sửa, có nhóm hồi quy **48/48 đạt** và kiểm tra cú pháp/diff. Một lần chạy rộng hơn ghi **242/244**; hai test timeout/hold lỗi khi chạy tích hợp nhưng đạt khi chạy riêng.
- **Đánh giá:** Test mục tiêu cho vòng lặp đạt, nhưng sai khác giữa chạy riêng và chạy tích hợp cho thấy kết quả chưa đủ để kết luận toàn suite ổn định. Mẫu liên quan là **F10 — Nợ kỹ thuật vô hình**.
- **Nguyên nhân gốc:** Dấu hiệu lỗi phụ thuộc cách ghép/chạy test, có thể liên quan trạng thái hoặc tài nguyên dùng chung; hồ sơ không đủ để khẳng định chính xác nguyên nhân của hai test.
- **Điều chỉnh đề xuất:** Cô lập dữ liệu và tài nguyên giữa test, chạy tuần tự các suite có side effect, rồi xác nhận lại hai test trong cùng điều kiện tích hợp. Không ghi nhận kết quả toàn suite xanh sau bước này.

### Lượt 19 — Hoàn thiện kịch bản booking theo dữ liệu và kiểm tra handoff chuyên viên · 05/11/2026 · Thành công một phần

- **Prompt (biên tập theo cấu trúc; diễn đạt lại từ cache, không nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – NHẬN DIỆN DỊCH VỤ VÀ KIỂM TRA KỊCH BẢN BOOKING
  ## MỤC TIÊU
  Nhận diện cách gọi dịch vụ tự nhiên, kiểm tra bốn kịch bản booking theo dữ liệu CSDL và xác minh trường hợp handoff chuyên viên.
  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc catalog, lịch hẹn, conversation state, ca làm/chuyên viên, source AI và test booking hiện có.
  ## CÁC TOOL/API CẦN CÓ
  Rà service resolver, availability/booking và handoff/staff API nếu có; ghi input/output, nêu rõ dữ liệu ca làm nào được dùng.
  ## KỊCH BẢN XỬ LÝ
  IF khách gọi dịch vụ bằng tên tự nhiên THEN ánh xạ dịch vụ có căn cứ; IF cần nhân viên THEN chỉ handoff theo dữ liệu ca làm và trạng thái hệ thống.
  ## QUY TẮC NGHIỆP VỤ
  Không tự chọn dịch vụ; không giả định chuyên viên đang sẵn sàng; dùng CSDL thực và không bịa lịch.
  ## QUẢN LÝ INTENT VÀ STATE
  Duy trì dịch vụ/ngày/giờ đã xác nhận giữa các lượt; handoff mang theo context phù hợp, không trộn booking khác.
  ## YÊU CẦU TRIỂN KHAI
  Bổ sung test cho bốn kịch bản và handoff; nếu thiếu fixture ca làm, ghi rõ test chưa thể chứng minh.
  ## KẾT QUẢ MONG MUỐN
  Báo nhận diện dịch vụ, kết quả từng kịch bản, coverage handoff và dữ liệu còn thiếu.
  ```
- **Kết quả AI trả về:** Các luồng booking/context được kiểm tra bằng hồi quy; cache ghi một nhóm **48/48 đạt**. Riêng kịch bản chuyển chuyên viên bị giới hạn vì dữ liệu ca làm chưa có.
- **Đánh giá:** Có kiểm tra theo dữ liệu dự án thay vì chỉ dựa vào phản hồi LLM; nhưng không thể chứng minh luồng handoff theo lịch làm việc nếu fixture không có ca trực.
- **Điều chỉnh đề xuất:** Bổ sung dữ liệu ca làm/fixture đại diện hoặc nêu rõ handoff không được xác minh; không tự suy diễn chuyên viên đang sẵn sàng.

### Lượt 20 — Chặn câu trả lời lạc đề và nội dung hướng dẫn nội bộ · 05–06/11/2026 · Đạt test hồi quy

- **Prompt (biên tập theo cấu trúc; diễn đạt lại từ cache, không nguyên văn):**
  ```text
  # PROMPT BỔ SUNG – CHẶN ĐẦU RA LẠC ĐỀ VÀ NỘI DUNG NỘI BỘ
  ## MỤC TIÊU
  Điều tra và ngăn phản hồi lạc đề, nhãn vai trò hoặc chỉ dẫn nội bộ xuất hiện trong câu trả lời khách hàng.
  ## NGUỒN DỮ LIỆU BẮT BUỘC
  Đọc log hội thoại, prompt, provider response, backend output filter, conversation state và test liên quan.
  ## CÁC TOOL/API CẦN CÓ
  Kiểm tra provider API và bước kiểm duyệt/format response hiện có; ghi input, output, lỗi và điểm response được lưu/trả về.
  ## KỊCH BẢN XỬ LÝ
  IF response phù hợp và có căn cứ THEN trả lời; IF chứa “assistant”, hướng dẫn nội bộ hoặc lạc đề THEN không gửi nguyên văn, tạo phản hồi an toàn theo state hoặc handoff.
  ## QUY TẮC NGHIỆP VỤ
  Không để lộ system prompt, mã nguồn, dữ liệu nội bộ; không bịa câu trả lời thay thế; không ghi secrets/full prompt vào log.
  ## QUẢN LÝ INTENT VÀ STATE
  Response thay thế phải dựa trên intent và state hiện hành; không reset hoặc xóa booking context khi lọc đầu ra.
  ## YÊU CẦU TRIỂN KHAI
  Tìm đúng lớp phát sinh; thực thi kiểm soát ở backend nếu cần; thêm test nội dung nội bộ, lạc đề, sai format và provider mock.
  ## KẾT QUẢ MONG MUỐN
  Khách không nhận nội dung nội bộ; báo test và giới hạn provider mock, không khẳng định mọi phản hồi provider thật đã được kiểm chứng.
  ```
- **Kết quả AI trả về:** Logic phản hồi được bổ sung để loại nhãn vai trò/hướng dẫn nội bộ và tạo câu trả lời an toàn theo state; các test liên quan nằm trong [bộ hồi quy chatbot dịch vụ tóc](../tests/ai_hair_service_booking_regression.test.js), báo cáo ghi test tập trung đạt.
- **Đánh giá:** Chuyển phần bảo vệ quan trọng xuống backend giúp giảm phụ thuộc vào việc model luôn tuân thủ prompt. Test mock xác minh logic, nhưng không chứng minh mọi phản hồi từ provider thật đều được xử lý đúng.
- **Điều chỉnh đề xuất:** Tiếp tục kiểm tra nội dung đầu ra với các phản hồi sai định dạng/lạc chủ đề; theo dõi log sau triển khai và không ghi toàn bộ prompt hay dữ liệu nhạy cảm vào log.

### Đối chiếu nguồn cho 10 lượt bổ sung

| Lượt | Nguồn đối chiếu |
|---:|---|
| 11–12 | Cache phiên `270047ef` (01/11) |
| 13 | Cache phiên `faa10715` (02/11) |
| 14–16 | Cache phiên `973348ec` (04/11); [báo cáo điều tra uốn tóc](./fixbug/chatbot-uon-toc-dat-lich.md); [System Prompt sáu phần](./fixbug/chatbot-system-prompt.md) |
| 17 | Cache phiên `2e77c2af`; [báo cáo lỗi chuyển booking](./fixbug/chatbot-booking-transition-provider-failure.md); [test phục hồi booking](../tests/ai_booking_transition_recovery.test.js) |
| 18–19 | Cache phiên `f3dcbd5a` (05/11); kết quả test được tóm tắt trong cache |
| 20 | Cache phiên `2e77c2af`; [bộ hồi quy chatbot dịch vụ tóc](../tests/ai_hair_service_booking_regression.test.js) |
