Phân chia các nhóm task song song cho các worker/reviewer để kiểm tra, phân tích và triển khai cho dự án website đặt lịch salon và chatbox AI vận hành thực tế (production) dựa trên `docs/spec/business_spec_booking.md`, `docs/spec/Câu-trả-lời.docx`, `docs/spec/phieu_lam_ro_change_request.md` và kế thừa kiểm tra trạng thái từ session trước tại `.agents/teamwork/`.

Working directory: d:\projects\chatbox
Integrity mode: benchmark
The team must NOT: sao chép mã nguồn từ các dự án mã nguồn mở có sẵn cho logic cốt lõi, sử dụng thư viện hoặc framework có sẵn cho chức năng cốt lõi, chạy script bên ngoài hoặc ủy quyền thực thi cho công cụ khác, đọc mã nguồn kiểm thử để hiểu hành vi mong đợi trước khi lập trình.

Reference:
- docs/spec/business_spec_booking.md
- docs/spec/Câu-trả-lời.docx
- docs/spec/phieu_lam_ro_change_request.md
- .agents/teamwork/

## Requirements

### R1. Cập nhật luồng Đặt lịch & Email Optional (Nhóm 1)
Cập nhật form đặt lịch trên web & chat, API validation, và database cho phép trường email là không bắt buộc (optional/null). Khách hàng tra cứu lịch hẹn ưu tiên bằng Số điện thoại + Mã đặt lịch (booking_code).

### R2. Cập nhật TTL giữ chỗ 5 phút & logic nhả slot tự động (Nhóm 2)
Cập nhật thời hạn giữ chỗ (Holding Slot) thành 5 phút (thay đổi từ mức 10 phút trước đây tại `appointmentRepository.js` và `booking_process_salons.test.js`). Hết 5 phút tự động nhả slot giữ chỗ. Thống nhất 5 phút cho thời gian chờ chọn giờ và nội dung tin nhắn tự động.

### R3. Triển khai Session Lifecycle & Timeout 2 giai đoạn (Nhóm 3)
Triển khai cơ chế timeout phiên chat AI theo mô hình 2 giai đoạn (tổng 10 phút): Sau 5 phút im lặng -> gửi tin cảnh báo ("...phiên chat sẽ kết thúc sau 5 phút"). Nếu sau thêm 5 phút nữa khách vẫn không phản hồi -> đóng phiên (chuyển sang trạng thái CLOSED). Khi khách nhắn lại vào phiên đã đóng, chuyển phiên cũ sang chỉ đọc (lưu lịch sử), tự động tạo phiên mới và AI chào lại từ đầu. Khi chuyển sang nhân viên thật tiếp nhận, kéo dài timeout lên 60 phút không tương tác mới tự động đóng phiên.

### R4. Cập nhật và mở rộng bộ kiểm thử (Nhóm 4)
Cập nhật và mở rộng bộ kiểm thử tự động trong `tests/` để pass 100% tất cả các tiêu chí nghiệp vụ mới và regression. Chạy kiểm thử, đối chiếu kết quả thực tế và báo cáo đầy đủ.

### R5. Ràng buộc kiến trúc và hạ tầng
Giữ nguyên kiến trúc hiện có (Node.js/Express, Mock JSON Database `database/data/`), không đập đi xây lại. Toàn bộ hoạt động thực thi trong môi trường local hiện tại.

## Verification Resources
- Thư mục kiểm thử hiện có: `tests/`
- Lệnh chạy kiểm thử: `npm test`
- Tài liệu nghiệp vụ & đặc tả:
  - `docs/spec/business_spec_booking.md`
  - `docs/spec/Câu-trả-lời.docx`
  - `docs/spec/phieu_lam_ro_change_request.md`
  - `.agents/teamwork/`

## Acceptance Criteria

### Business Acceptance Criteria
- [ ] CR-01: Trường Email là không bắt buộc (Optional) trên form đặt lịch web và chat; API validation và database chấp nhận email null/rỗng; khách hàng tra cứu lịch hẹn thành công bằng Số điện thoại + Mã đặt lịch.
- [ ] CR-02: Thời gian chờ chọn giờ và nội dung tin nhắn tự động thống nhất là 5 phút.
- [ ] CR-03: Holding slot có TTL 5 phút (cập nhật tại `appointmentRepository.js` và `booking_process_salons.test.js`); tự động giải phóng slot sau 5 phút nếu không được xác nhận.
- [ ] CR-04: Phiên chat AI áp dụng timeout 2 giai đoạn: gửi tin cảnh báo sau 5 phút im lặng, tự động chuyển sang trạng thái CLOSED sau thêm 5 phút tiếp theo không phản hồi (tổng 10 phút).
- [ ] CR-05: Khi khách nhắn lại vào phiên chat đã CLOSED: phiên cũ được chuyển sang chỉ đọc (lưu lịch sử), hệ thống tự động khởi tạo phiên mới và AI gửi lời chào lại từ đầu.
- [ ] CR-06: Khi chuyển sang nhân viên thật tiếp nhận, timeout kéo dài lên 60 phút không tương tác mới tự động đóng phiên.

### Architecture & Regression Criteria
- [ ] Giữ nguyên kiến trúc hiện có (Node.js/Express, Mock JSON Database `database/data/`), không đập đi xây lại.
- [ ] 100% test cases trong `tests/` (bao gồm các test hiện có và các test mới bổ sung) vượt qua khi chạy `npm test`.
