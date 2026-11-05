# Điều tra lỗi chuyển từ tư vấn dịch vụ sang đặt lịch

## Trạng thái

Đã hoàn thành truy vết dữ liệu hội thoại và code. Báo cáo nguyên nhân, phạm vi và kế hoạch kiểm thử được ghi trước khi bắt đầu sửa code; bản cuối ghi lại thay đổi và kết quả kiểm thử.

## 1. Mô tả lỗi và tái hiện

1. Khách nhắn `uốn mái`.
2. AI tra cứu và phản hồi dịch vụ `Uốn mái / phồng mái`.
3. Khách nhắn `đặt lịch vào 14 giờ ngày mai`.
4. AI trả thông báo chung rằng hệ thống AI đang gặp sự cố.

Ngày `ngày mai` được tính theo `Asia/Ho_Chi_Minh`. Tin nhắn xảy ra lúc 00:22 ngày 05/11/2026 theo giờ Việt Nam, do đó ngày đặt là 06/11/2026.

## 2. Kết quả thực tế và mong muốn

- **Thực tế:** AI trả lỗi chung dù backend đã ghi nhận đúng dịch vụ, ngày giờ, và đã giữ được slot. Lịch giữ chỗ có hạn 5 phút nên khách nhận thông báo lỗi trong khi slot đã bị giữ.
- **Mong muốn:** Giữ nguyên dịch vụ/ngày/giờ; kiểm tra dịch vụ còn thiếu thông tin bắt buộc nào; tiếp tục booking bằng phản hồi backend xác định, không phụ thuộc một lượt gọi LLM chỉ để hỏi thông tin khách. Chỉ giữ slot khi các dữ liệu cần để định giá/đặt chỗ đã hợp lệ.

## 3. Bằng chứng truy vết

### Hội thoại và state

- `database/data/messages.json`, các bản ghi khoảng dòng 26721–26761: khách gửi `uốn mái`, AI nhận diện `Uốn mái / phồng mái`, sau đó khách gửi `đặt lịch vào 14 giờ ngày mai` và nhận fallback.
- `database/data/conversations.json`, bản ghi conversation `c2ce5051-4b5a-4c38-9037-9b2cb5abb6d6`: state cuối vẫn có service ID `22222222-2222-2222-2222-222222223005`, `booking_service_confirmed: true`, `booking_started: true`, `appointment_date: 2026-11-06`, `appointment_time: 14:00`. State cho thấy service, ý định, ngày và giờ đã được nhận diện/lưu đúng.
- `database/data/appointments.json`, bản ghi cùng conversation: backend tạo hold cho đúng service, ngày 06/11, 14:00 lúc 17:22:23.755Z, ngay sau tin nhắn khách lúc 17:22:23.730Z. Hold hết hạn lúc 17:27:23.754Z; phản hồi lỗi được ghi lúc 17:25:19.221Z. Do đó slot đã bị giữ khi khách thấy lỗi.
- Không có file log runtime chứa entry của request/provider trong workspace. Dữ liệu hội thoại không lưu exception gốc; vì vậy không thể kết luận subtype lỗi provider (timeout, HTTP, mạng hay phản hồi sai định dạng) chỉ từ log còn lại.

### Luồng backend

- `src/routes/conversations.js` lưu tin khách, gọi `orchestrator.chat()` rồi lưu phản hồi.
- `src/ai/conversationContext.js:updateConversationContext()` gọi `extractDateFromText()` và `extractTimeFromText()`, lưu ngày/giờ. `src/ai/tools.js:getVietnamDate()` dùng múi giờ `Asia/Ho_Chi_Minh`; parser nhận diện `ngày mai` và `14 giờ`.
- `src/ai/orchestrator.js:chat()` gọi `updateConversationContext()` trước khi booking tiếp tục, sau đó gọi `handleBookingContinuation()`.
- `src/ai/orchestrator.js:handleBookingContinuation()` kiểm tra giờ hoạt động, gọi `check_available_slots`, rồi `hold_appointment_slot`. Khi thiếu thông tin liên hệ, nhánh cuối trả `null`, thay vì trả một câu hỏi booking xác định.
- Vì `chat()` chỉ return khi `bookingReply` truthy, giá trị `null` khiến nó tiếp tục xây prompt và gọi `provider.chat()`. Ngoại lệ trong vòng gọi provider được bắt tại nhánh catch ở cuối `chat()` và được đổi thành đúng nội dung fallback đã lưu. Catch không ghi `err.message` hay `err.cause`, và không có log runtime được lưu để truy ngược subtype.
- Chênh lệch thời gian khoảng 175 giây giữa yêu cầu và fallback phù hợp với một lần gọi provider chậm/lỗi, nhưng không đủ chứng minh timeout cụ thể.

### Phát hiện dữ liệu size

- `database/data/products.json`: dịch vụ ID `22222222-2222-2222-2222-222222223005` có `prices_by_size` S/M/L; mức giá là 80.000/100.000/120.000 VNĐ.
- Tin nhắn không cung cấp size/độ dài tóc. Tuy vậy bản ghi hold đã được tạo với giá 80.000 VNĐ, là giá size S mặc định. Đây là vấn đề nghiệp vụ kèm theo: luồng booking không hỏi thông tin size trước khi giữ slot dù giá phụ thuộc size. Không được coi phản hồi lỗi là bằng chứng thiếu size làm phát sinh exception; bằng chứng hiện có cho thấy size không chặn việc tạo hold.

## 4. Nguyên nhân gốc rễ

**Nguyên nhân trực tiếp của thông báo lỗi:** luồng booking đã kiểm tra và giữ slot thành công, nhưng `handleBookingContinuation()` trả `null` khi chưa có tên/số điện thoại. Orchestrator hiểu `null` là chưa có phản hồi booking và gọi LLM để tiếp tục. Lỗi phát sinh trong vòng gọi provider/tool sau đó rơi vào catch trả fallback chung. Đây là lỗi điều phối backend sau một hành động booking thành công, không phải lỗi nhận diện dịch vụ hay parse ngày/giờ.

**Giới hạn kết luận:** exception cụ thể của provider không thể khẳng định vì log runtime không tồn tại trong dữ liệu dự án và log catch hiện không ghi thông điệp/cause. Cần tăng logging có cấu trúc để các sự cố tương tự có thể truy vết mà không ghi secrets hoặc toàn bộ prompt.

**Vấn đề nghiệp vụ liên quan:** thông tin size bị bỏ qua dù dịch vụ có giá theo size; backend giữ slot với giá mặc định S. Cần ngăn giữ slot cho dịch vụ có `prices_by_size` khi chưa xác định size hợp lệ.

## 5. File/function liên quan

- `database/data/messages.json`: bản ghi hội thoại thực tế.
- `database/data/conversations.json`: state cuối của conversation.
- `database/data/appointments.json`: hold thực tế tạo trong request.
- `database/data/products.json`: giá và thời lượng theo size của dịch vụ.
- `src/routes/conversations.js`: lưu tin nhắn và gọi orchestrator.
- `src/ai/conversationContext.js:updateConversationContext()`: lưu service/date/time.
- `src/ai/tools.js:extractDateFromText()`, `extractTimeFromText()`, `getVietnamDate()`, `executeTool()`: parse thời gian và thực thi tool.
- `src/ai/orchestrator.js:chat()`, `handleBookingContinuation()`: chuyển tiếp booking và fallback provider.
- `src/ai/providers/GeminiProvider.js:chat()`, `src/ai/providers/OllamaProvider.js:chat()`: timeout/retry và lỗi provider.

## 6. Phạm vi ảnh hưởng

- Yêu cầu booking đã có service/date/time và chưa có liên hệ có thể giữ slot rồi phụ thuộc provider để hỏi bước tiếp theo; provider lỗi khiến khách thấy thông báo sự cố dù slot còn bị giữ.
- Dịch vụ có giá theo size có thể bị giữ với mức giá mặc định nếu size chưa được hỏi.
- Các lượt không đặt lịch, luồng tư vấn, luồng xác nhận khi đã có đủ thông tin liên hệ và các dịch vụ giá cố định không phải nguyên nhân của lỗi này.

## 7. Phương án sửa và kế hoạch

1. Bảo toàn state ngày/giờ/service; với service có `prices_by_size`, hỏi đúng thông tin size còn thiếu và chưa giữ slot/không gán giá mặc định.
2. Sau khi hoàn tất check/hold thành công, trả phản hồi booking xác định trực tiếp từ backend (đã giữ chỗ và chỉ hỏi các liên hệ còn thiếu), không trả `null` để gọi LLM cho cùng bước.
3. Nếu kiểm tra lịch hoặc giữ slot trả lỗi/throw, ghi log có cấu trúc với phase, conversation ID, service ID, error code/name và status; không log secret, full prompt, exception message hoặc dữ liệu liên hệ. Trả thông báo phù hợp, giữ lại state; không báo thành công nếu chưa thành công.
4. Thêm test cho: hội thoại thật, đổi giờ, đổi service và xóa dữ liệu phụ thuộc, giờ đã kín có alternative từ backend, tool availability lỗi mà state được giữ, thiếu size hỏi đúng và không tạo hold.
5. Chạy test tập trung trước, sau đó chạy hồi quy booking/context hiện có; xác nhận không tạo lịch/hold khi thiếu thông tin định giá bắt buộc.

## 8. Thay đổi đã triển khai

- `src/ai/orchestrator.js:handleBookingContinuation()` tiếp tục dùng dịch vụ/ngày/giờ đã lưu; dịch vụ có giá theo size sẽ được hỏi độ dài tóc trước khi kiểm tra/giữ chỗ. Khi thiếu ngày hoặc giờ, backend hỏi đúng phần còn thiếu. Sau khi giữ chỗ thành công, phản hồi trực tiếp từ backend nêu dịch vụ, slot và thông tin liên hệ còn thiếu; không rơi về LLM vì nhánh booking trả `null`.
- Khi khách đổi dịch vụ, booking giải phóng hold cũ và xóa size phụ thuộc dịch vụ cũ, nhưng giữ ngày/giờ. Việc đổi sang cắt tóc được nhận diện.
- Log lỗi booking có phase, conversation ID, service IDs, error name/code, HTTP status và upstream status nếu có; không ghi exception message hoặc nội dung nhạy cảm. Lỗi availability giữ nguyên state và trả thông báo phù hợp.
- `src/repositories/appointmentRepository.js`, `src/services/appointmentService.js` và `src/ai/tools.js` truyền size đến thao tác hold/tạo lịch và dùng giá/thời lượng theo size; không dùng mặc định size S nếu khách chưa cung cấp size.
- `src/ai/servicePricing.js` cung cấp câu hỏi xác định độ dài tóc và các helper dùng chung.
- Không sửa frontend cho lỗi này: nguyên nhân và sửa chữa nằm trong backend. Prompt không được dùng làm giải pháp duy nhất.

## 9. Kiểm thử và kết quả

Đã bổ sung `tests/ai_booking_transition_recovery.test.js` với 7 ca kiểm thử: luồng tư vấn→booking và timezone Việt Nam; đổi giờ; đổi dịch vụ; giờ kín; lỗi availability và giữ state/log; thiếu size không được giữ chỗ; giá theo size. Cập nhật các hồi quy liên quan đến context, ưu tiên intent, dịch vụ tóc, slot thay thế, booking và định giá để kiểm tra hành vi mới.

Chạy tuần tự các suite sau (tránh tranh chấp giữa các suite cùng sửa JSON store):

| Suite | Kết quả |
|---|---:|
| `ai_conversation_context.test.js` | 15/15 |
| `ai_booking_transition_recovery.test.js` | 7/7 |
| `ai_booking_intent_priority.test.js` | 6/6 |
| `ai_hair_service_booking_regression.test.js` | 9/9 |
| `ai_alternate_slots.test.js` | 8/8 |
| `ai_booking_flow.test.js` | 9/9 |
| `ai_service_pricing.test.js` | 8/8 |
| `booking_process_salons.test.js` | 9/9 |
| `appointments.test.js` | 4/4 |
| **Tổng** | **75/75 đạt** |

`node --check` đạt cho các module backend đã sửa và `git diff --check` không phát hiện lỗi whitespace. Chưa chạy toàn bộ test suite của repository. Không thể xác định subtype lỗi provider lịch sử vì exception gốc không được lưu; thay đổi này xử lý đúng đường đi backend có bằng chứng và cải thiện khả năng truy vết những lỗi booking tương lai.
