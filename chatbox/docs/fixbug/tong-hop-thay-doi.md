# Tổng hợp thay đổi website khách hàng

## Các file được sửa hoặc thêm

| File | Nội dung thay đổi |
|---|---|
| `public/index.html` | Chuẩn hóa menu trang chủ; bỏ nút “Đặt lịch hẹn ngay”; sửa nút mở chat AI; chuẩn hóa nút dịch vụ nổi bật thành “Tư vấn ngay” và “Chi tiết”; đổi tên nút chat chuyên viên. |
| `public/products.html` | Chuẩn hóa menu; đổi card từ “Đặt lịch” thành hai nút “Tư vấn ngay” và “Chi tiết”; thêm nút menu mobile. |
| `public/product-detail.html` | Chuẩn hóa menu và hành động tư vấn chi tiết dịch vụ; nút tư vấn truyền đúng mã dịch vụ vào chat. |
| `public/chat.html` | Chuẩn hóa menu trang chat, bổ sung menu mobile và mục tài khoản. |
| `public/js/chat.js` | Gắn xử lý click ủy quyền cho nút mở chat và nút tư vấn trên card; truyền ngữ cảnh dịch vụ khi mở chat; thêm điều khiển menu mobile. |
| `public/account.html` | Thêm trang đăng ký/đăng nhập/tài khoản khách hàng dùng chung. |
| `public/css/account.css` | Tạo kiểu cho tab có trạng thái chọn, lỗi trường nhập, trạng thái gửi và bố cục điện thoại. |
| `public/js/account.js` | Xử lý chuyển tab, xác thực dữ liệu, lỗi ngay dưới trường nhập, trạng thái đang gửi, đăng ký/đăng nhập/đăng xuất qua API hiện có. |
| `public/appointments.html` | Gỡ trang form đặt lịch và tra cứu riêng dành cho khách. |
| `public/js/appointments.js` | Gỡ mã giao diện form đặt lịch khách. |
| `src/app.js` | Chuyển URL cũ `/appointments.html` sang `/chat.html`; không thay đổi API đặt lịch. |
| `tests/auth_persistence.test.js` | Bổ sung kiểm thử đăng nhập bằng tài khoản khách vừa đăng ký. |
| `README.md` | Cập nhật hướng dẫn khách đặt lịch qua chat và vị trí chức năng tài khoản. |
| `docs/fixbug/web_khach/bao-cao.md` | Báo cáo lỗi, nguyên nhân và kết quả kiểm tra website khách hàng. |

## Kiểm tra đã thực hiện

- Kiểm tra trên trình duyệt menu, điều hướng tới phần Đánh giá/Liên hệ, menu mobile, card dịch vụ, chat, chuyển hướng URL form cũ và giao diện tài khoản.
- Kiểm tra UI tài khoản ở viewport điện thoại: chuyển tab, lỗi dữ liệu, trạng thái đang gửi và bố cục không tràn ngang.
- `node --check` và `git diff --check` đạt.
- Kiểm thử `tests/auth_persistence.test.js` đạt 5/5; `tests/auth.test.js` đạt 3/3 trong lần chạy đã ghi ở báo cáo chi tiết.
- Phản hồi submit trên UI tài khoản được mô phỏng khi kiểm tra; không tạo tài khoản thử thật qua biểu mẫu. Kiểm tra chatbot đặt lịch end-to-end và màn hình quản trị được mô tả trong báo cáo chi tiết.

## Dữ liệu và thay đổi không thuộc phần sửa code

- Không chủ động sửa nghiệp vụ backend xác thực, API đặt lịch, trang quản trị hoặc nội dung dữ liệu khách hàng.
- Trước khi bắt đầu sửa, working tree đã có thay đổi ở `database/data/business_settings.json`, `categories.json`, `products.json`, `system_settings.json`, `chatbox/package-lock.json` và `package-lock.json` tại thư mục gốc. Các thay đổi này được giữ nguyên.
- Hiện working tree còn hiển thị thay đổi trong một số JSON dữ liệu (gồm lịch hẹn, hội thoại, tin nhắn, người dùng). Đây không phải thay đổi code được yêu cầu; không hoàn tác hoặc ghi đè các dữ liệu này.
- Không tạo commit hoặc push.
