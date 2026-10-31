# Báo cáo sửa lỗi website khách hàng

| Bug | Nguyên nhân | File/hàm đã sửa | Kết quả kiểm tra |
|---|---|---|---|
| Menu không đồng nhất, thiếu đăng ký/đăng nhập | Menu trang con khác trang chủ; giao diện đăng nhập/đăng ký chỉ gắn với trang đặt lịch cũ. | `public/index.html`, `public/products.html`, `public/product-detail.html`, `public/chat.html`; thêm `public/account.html`, `public/js/account.js`; `public/js/chat.js` | Đã kiểm tra trên trình duyệt: cả trang chủ, danh sách, chi tiết, chat và tài khoản có đúng 5 mục; liên kết Đánh giá/Liên hệ từ trang chi tiết về đúng phần trang chủ; menu mobile mở được. Tab đăng ký hiển thị đúng form. |
| Đăng ký/đăng nhập khách hàng không truy cập được nhất quán | Backend `/api/auth/register` và `/api/auth/login` có sẵn; UI auth cũ chỉ xuất hiện trong trang đặt lịch riêng. | `public/account.html`, `public/js/account.js`; bổ sung kiểm thử trong `tests/auth_persistence.test.js` | Kiểm thử API đăng ký, đăng nhập user, token và phiên khách: `auth_persistence.test.js` đạt 5/5. Chưa gửi form đăng ký/đăng nhập thật từ trình duyệt. |
| Form đặt lịch riêng còn truy cập được | Trang `/appointments.html` chứa form đặt lịch và tra cứu riêng, không phù hợp luồng đặt lịch qua chat. | Xóa `public/appointments.html`, `public/js/appointments.js`; thêm redirect trong `src/app.js` | Đã kiểm tra URL cũ chuyển đến `/chat.html`. Không sửa API `src/routes/appointments.js` hay trang quản trị lịch hẹn. |
| Nút tư vấn trên card không ổn định sau khi render lại | Nút nội suy sự kiện inline trong HTML động, gán ngữ cảnh sau khi mở chat; danh sách lọc/tải lại có thể làm mất hoặc lỗi handler. | `public/js/chat.js` (`bindEvents`, `openChat`); `public/index.html`, `public/products.html`, `public/product-detail.html` | Đã kiểm tra trang chủ có 6 card và trang dịch vụ có 15 card; mỗi card có đúng “Tư vấn ngay” và “Chi tiết”. Handler dùng ủy quyền sự kiện trên document để hoạt động với nội dung render lại. Chưa gửi tin nhắn/đặt lịch AI trực tiếp trong trình duyệt. |

## Kiểm tra

- Đạt: `node --check` cho `public/js/account.js`, `public/js/chat.js`, `src/app.js`; `git diff --check`.
- Đạt: kiểm tra trình duyệt trên server cục bộ cổng 3111 cho menu, anchor, menu mobile, card dịch vụ, tab auth và redirect URL cũ.
- Đạt: `node --test --test-concurrency=1 tests/auth_persistence.test.js` — 5/5.
- Đạt: `tests/auth.test.js` — 3/3 khi chạy cùng `tests/appointments.test.js`.
- Chưa đạt toàn bộ: `tests/appointments.test.js` có 4 assertion thất bại với thông báo/kỳ vọng hiện tại (mong thông báo tiếng Anh nhưng nhận tiếng Việt; một assertion xung đột giờ không nhận rejection). Không sửa nghiệp vụ đặt lịch trong phạm vi này.
- Chưa kiểm tra: đăng ký/đăng nhập bằng cách gửi form thật trên trình duyệt; chatbot trả lời AI và tạo lịch end-to-end; thao tác quản trị lịch trên giao diện. API đặt lịch và các trang admin không bị sửa.

## Tự kiểm tra lại trên giao diện

1. Mở trang chủ, danh sách dịch vụ, một trang chi tiết và `/chat.html`; xác nhận thanh điều hướng có đủ 5 mục.
2. Từ trang chi tiết bấm **Đánh giá** hoặc **Liên hệ**; xác nhận trình duyệt về đúng phần tương ứng trên trang chủ.
3. Mở **Đăng ký/Đăng nhập**, thử chuyển hai tab; đăng ký bằng email chưa có tài khoản, sau đó đăng xuất và đăng nhập lại.
4. Kiểm tra card trang chủ và danh sách sau khi lọc/tải lại: bấm **Tư vấn ngay** để mở chat, **Chi tiết** để vào đúng dịch vụ.
5. Gửi yêu cầu đặt lịch trong chat và xác nhận lịch trong trang quản trị; thử `/appointments.html` cũ để xác nhận được chuyển sang chat.
