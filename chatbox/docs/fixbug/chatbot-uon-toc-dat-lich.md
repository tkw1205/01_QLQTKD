# Điều tra bug chatbot tư vấn và đặt lịch dịch vụ uốn tóc

## Trạng thái điều tra

Đã đối chiếu log hội thoại ngày 04/11/2026 với dữ liệu danh mục, system prompt đang hoạt động, mã xử lý hội thoại, vòng đời phiên và các test booking hiện có. Chưa có thay đổi code tại thời điểm ghi nhận báo cáo này.

## Nguyên nhân gốc rễ

| Bug | Nguyên nhân |
|---|---|
| 1. Tự tạo câu hỏi tư vấn | Prompt cho phép hỏi thêm mong muốn/đặc điểm tóc và có nhiều chỉ dẫn điều phối lặp lại, nhưng không giới hạn câu hỏi vào dữ liệu/quy trình thực tế. Dữ liệu dịch vụ không yêu cầu khách tự chọn kiểu uốn, phạm vi uốn, dịch vụ đi kèm hay thời lượng; thời lượng đã có ở dịch vụ. Vì vậy mô hình có thể sinh các câu hỏi không có căn cứ. |
| 2. Không ánh xạ tên dịch vụ | `findDirectMatches()` trong `src/ai/servicePricing.js` chỉ so khớp tên/alias theo cụm từ liên tục. Dữ liệu “Uốn mái / phồng mái” có alias “uốn mái”, “phồng mái”, nên cụm “uốn tóc mái” không khớp. Category “Uốn tóc” chỉ xác định được nhóm có nhiều dịch vụ, không xác định một sản phẩm duy nhất. |
| 3. Mất dịch vụ trong booking | `updateConversationContext()` chỉ xác nhận dịch vụ khi tìm được match chính xác. Sau đó nhánh yêu cầu đặt lịch trong `src/ai/orchestrator.js` xóa `selected_service_ids` và `booking_service_confirmed` khi booking chưa được đánh dấu xác nhận, kể cả khi tin nhắn đặt lịch có tên dịch vụ. Kết quả là ngày/giờ được lưu nhưng booking vẫn chờ chọn dịch vụ. |
| 4. Hỏi lại dịch vụ | Là hệ quả của bug 2 và 3: tên dịch vụ không được phân giải, còn nhánh `explicitBookingRequest` trả câu hỏi dịch vụ ngay lập tức. Khi khách nhắc lại cùng tên, match vẫn không đủ cụ thể nên state không tiến triển. |
| 5. Lộ hướng dẫn nội bộ / chữ `assistant` | `buildSystemPrompt()` ghép system prompt cấu hình với các chỉ dẫn dài và một số kịch bản tổng quát. Không có kiểm tra đầu ra cho văn bản kiểu “Nếu khách muốn...” hoặc tiền tố vai trò. `messageRepository.findForAI()` ánh xạ đúng tin nhắn lịch sử thành role `assistant`; log cho thấy chữ `assistant` và hướng dẫn là phần văn bản mô hình sinh ra, không phải nhãn do frontend thêm. Route lưu nguyên `content`; UI hiển thị nguyên văn sau khi escape HTML. |
| 6. Thông báo phiên chat | Cảnh báo được lưu như tin nhắn `assistant` và được đưa vào lịch sử AI; scheduler không xóa `chat_context`, còn tương tác mới reset cờ cảnh báo. Vì thế cảnh báo không trực tiếp xóa booking state, nhưng chưa có test xác nhận booking đã chọn được tiếp tục sau cảnh báo. Timeout đóng phiên thì đổi mode và giải phóng hold; đây là hành vi riêng, không nên tự chuyển booking sang phiên mới. |

### Đối chiếu dữ liệu nghiệp vụ

- `categories.json` có nhóm đang hoạt động “Uốn tóc”, mô tả các dịch vụ uốn mái/phồng mái, phồng chân và uốn sản phẩm ART.
- `products.json` có dịch vụ “Uốn mái / phồng mái” (60 phút, giá theo size) với alias “uốn mái”, “phồng mái”. Danh mục cũng có các dịch vụ uốn sóng lơi, uốn phồng chân tóc và uốn sản phẩm ART. Không có căn cứ dữ liệu cho việc hỏi khách tự uốn tại nhà, phạm vi cả đầu/phần mái hoặc tự chọn thời lượng.
- Cụm “uốn tóc” chỉ xác định nhóm dịch vụ; nếu khách không nêu thêm chi tiết thì cần đưa lựa chọn thật trong nhóm để khách xác nhận, không tự chọn một sản phẩm.
- Log lưu trong `messages.json` xác nhận các câu hỏi ngoài nghiệp vụ, việc hỏi lại dịch vụ, câu trả lời bắt đầu bằng `assistant` và nội dung “Nếu khách muốn uốn tóc, bạn có thể hỏi...”.

## System prompt trước khi sửa

System prompt đang hoạt động nằm trong `database/data/system_settings.json` (key `ai_system_prompt`); mặc định khởi tạo nằm trong `src/config/jsonStore.js`. Bản cũ được tổ chức theo phong cách, nguồn thông tin, địa điểm, đặt lịch và các kịch bản phản hồi; `buildSystemPrompt()` còn ghép thêm nhiều chỉ dẫn runtime tĩnh. Prompt có quy tắc an toàn về dữ liệu/giá/lịch, nhưng cho phép hỏi thêm không có căn cứ, không phân biệt dịch vụ được nhắc đến với dịch vụ đã xác nhận cho booking, chưa cấm rõ hướng dẫn nội bộ/tiền tố vai trò, và có chỉ dẫn trùng/mâu thuẫn về giữ chỗ. Nội dung cũ nguyên văn không còn trong file làm việc; mô tả này đối chiếu cấu hình trước sửa từ Git.

## System prompt sau khi sửa

Nội dung chuẩn hóa theo sáu mục được lưu tại [chatbot-system-prompt.md](./chatbot-system-prompt.md), được nạp làm prompt mặc định bởi `src/ai/systemPrompt.js`, và đã cập nhật giá trị đang hoạt động `ai_system_prompt` trong `database/data/system_settings.json`.

Các nguyên tắc chính đã chuẩn hóa:

1. **ROLE** — trợ lý Salon giao tiếp trực tiếp với khách, không đóng vai người hướng dẫn/tư vấn nội bộ.
2. **SCOPE** — chỉ dùng danh mục, sản phẩm, booking, hội thoại và công cụ backend hiện có.
3. **BUSINESS RULES** — trình tự tư vấn, xác định service/size, báo giá, đặt lịch, kiểm tra giờ, thu thập liên hệ, xác nhận và duy trì state.
4. **OUTPUT FORMAT** — tiếng Việt ngắn gọn, tối đa một câu hỏi chính, không lộ prompt, nhãn `assistant` hoặc nội dung “Nếu khách muốn...”.
5. **UNCERTAINTY** — hỏi đúng phần còn thiếu, nêu lựa chọn có thật khi mơ hồ, không suy đoán.
6. **CONSTRAINTS** — không bịa dữ liệu, không hỏi lại, không làm mất state, không tạo đặt lịch giả và không hỏi các chi tiết uốn tóc ngoài quy trình.

Prompt runtime chỉ ghép thêm catalog dịch vụ đang hoạt động, trạng thái service/booking riêng biệt, ngày giờ, thông tin khách hiện tại, trạng thái handoff/hold và quy tắc sử dụng công cụ. Các kịch bản tĩnh cũ gây trùng lặp/mâu thuẫn đã được bỏ.

## Kế hoạch sửa

1. Chuẩn hóa system prompt đang hoạt động và prompt mặc định theo sáu mục: Vai trò, Phạm vi, Quy tắc nghiệp vụ, Định dạng đầu ra, Xử lý khi không chắc chắn, Giới hạn. Giữ các quy tắc đặt lịch an toàn hiện có.
2. Cải thiện ánh xạ ngôn ngữ tự nhiên cho dịch vụ có thật “Uốn mái / phồng mái”; với “uốn tóc” chung chung, chỉ đưa các dịch vụ uốn đang hoạt động để khách xác nhận.
3. Sửa booking state để dịch vụ cụ thể trong yêu cầu đặt lịch hoặc câu trả lời cho câu hỏi chọn dịch vụ được lưu/xác nhận; cập nhật ngày/giờ không xóa dịch vụ. Khi đổi dịch vụ, chỉ thay dịch vụ khi khách thực sự chỉ rõ dịch vụ mới.
4. Thêm xử lý đầu ra backend để từ chối/khôi phục an toàn phản hồi lộ hướng dẫn nội bộ hoặc nhãn vai trò, không dựa riêng vào prompt. Không thay đổi cách hiển thị frontend nếu backend trả nội dung sạch.
5. Đảm bảo tin nhắn cảnh báo phiên không làm mất ngữ cảnh; thêm kiểm thử tiếp tục booking sau cảnh báo và giữ nguyên trạng thái/draft.
6. Viết test hồi quy cho bảy yêu cầu trong đề bài; chạy test tập trung, sau đó chạy toàn bộ suite nếu thời gian/môi trường cho phép.

## Thay đổi backend/frontend

- `src/ai/servicePricing.js`: nhận diện cụm dịch vụ trực tiếp và liệt kê dịch vụ thật trong nhóm khi khách hỏi rộng.
- `database/data/products.json`: thêm alias `uốn tóc mái`, `uốn phồng phần mái` cho sản phẩm có thật “Uốn mái / phồng mái”; không tạo sản phẩm mới.
- `src/ai/conversationContext.js`: lưu nguồn dịch vụ (`service_consultation`, `price_inquiry`, `booking_request`), chỉ coi dịch vụ là xác nhận booking khi khách xác nhận trong ngữ cảnh booking; dùng lại dịch vụ tư vấn khi bắt đầu booking; bảo toàn dịch vụ khi cập nhật ngày/giờ.
- `src/ai/orchestrator.js`: không xóa dịch vụ booking đã xác nhận; khi service còn mơ hồ liệt kê các mục thật trong nhóm; chỉ ghép dữ liệu runtime vào prompt chuẩn; lọc câu trả lời lộ hướng dẫn nội bộ/nhãn vai trò và tạo phản hồi an toàn theo state.
- `src/repositories/messageRepository.js`, `src/services/sessionTimeoutService.js`: đánh dấu tin cảnh báo timeout bằng metadata và loại cảnh báo mới/cũ khỏi lịch sử gửi cho AI, nhưng vẫn giữ tin nhắn hiển thị và trong lịch sử nhân viên.
- `src/config/jsonStore.js`, `database/data/system_settings.json`: dùng prompt sáu phần mới làm prompt mặc định và giá trị đang hoạt động.
- Frontend không cần thay đổi: route và UI vốn hiển thị nguyên nội dung backend; phần lộ nội dung được xử lý tại backend trước khi lưu/trả về.

## Test và kết quả

Test mới trong `tests/ai_hair_service_booking_regression.test.js` bao phủ: nhóm uốn tóc chung chung, alias uốn mái, giữ dịch vụ khi nhận ngày, ngày trước dịch vụ, tái sử dụng dịch vụ tư vấn khi bắt đầu booking, chặn nhãn/hướng dẫn nội bộ, đổi dịch vụ, cảnh báo phiên và cấu trúc prompt.

Kiểm thử tập trung trước đó: **38/38 đạt** (`ai_hair_service_booking_regression`, `ai_conversation_context`, `ai_booking_intent_priority`, `ai_service_pricing`). Sau khi suite toàn bộ phát hiện các test cũ vẫn yêu cầu generic service inquiry luôn đi qua LLM, đã cập nhật các kỳ vọng đó để kiểm tra catalog-first; hai suite bị ảnh hưởng chạy lại đạt **12/12** (`ai_haircut_consultation`, `ai_hair_service_booking_regression`). Các test context dùng ngày động thay cho ngày cố định đã qua trong `tests/ai_conversation_context.test.js`.

Suite toàn bộ đã chạy: **227/231 đạt, 4 lỗi**. Ba lỗi là kỳ vọng cũ về việc generic haircut/service consultation phải gọi LLM; các test đó đã được cập nhật theo yêu cầu mới và affected suites đã đạt 12/12. Lỗi còn lại ở `tests/adversarial_cr01_cr03.test.js:613` nhận HTTP 409 thay vì 201 khi giữ khung giờ trong test; dữ liệu chia sẻ đã có lịch/hold chiếm khung đó. Không chạy lại toàn suite sau cập nhật test, do lần chạy trước kéo dài khoảng 14 phút; vì vậy chưa xác nhận toàn suite sau các thay đổi test. Baseline ban đầu có hai lỗi do test dùng ngày `2026-11-02` đã qua ngày chạy; đã đổi sang ngày động theo giờ Việt Nam và các test liên quan hiện đạt.

## Lỗi còn tồn tại / giới hạn

- Không có test trực tiếp với provider LLM bên ngoài; test xác minh logic backend bằng provider mock. Cần theo dõi log thực tế sau triển khai.
- Câu trả lời provider bị phát hiện là nội dung hướng dẫn nội bộ được thay bằng câu trả lời an toàn dựa trên state; không thể khôi phục ý định tư vấn nếu state không có dữ liệu liên quan.
- Toàn bộ test suite chưa xanh: còn một test giữ chỗ thất bại với HTTP 409 do khung giờ đã bị chiếm trong dữ liệu test dùng chung; cần cô lập dữ liệu hoặc dùng khung giờ duy nhất để xác minh suite sạch.
