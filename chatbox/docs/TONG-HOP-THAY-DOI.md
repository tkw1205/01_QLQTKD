# Tổng hợp các nội dung đã thay đổi

## 1. Thương hiệu salon

- Thống nhất tên hiển thị thành **Mây Hair Studio** ở khu vực Admin, lễ tân và khách hàng.
- Cập nhật các tiêu đề, nội dung chat và tên salon mặc định trong cấu hình hệ thống.

## 2. Đồng bộ danh sách dịch vụ

- Admin và Staff quản lý dịch vụ trên cùng nguồn dữ liệu Backend/API.
- Admin và Staff có thể thêm, sửa và xóa dịch vụ theo quyền; quản lý nhóm dịch vụ vẫn giới hạn cho Admin.
- Customer chỉ xem dịch vụ đang hoạt động. Backend từ chối thao tác thêm, sửa, xóa của Customer và không cho xem dịch vụ đã ngừng hoạt động.
- Các trang khách hàng tải dữ liệu dịch vụ từ API, không duy trì danh sách dịch vụ, giá hoặc size riêng trong giao diện.
- Dữ liệu dịch vụ gồm nhóm, mô tả, ảnh URL, thời lượng, số nhân viên, các mức giá theo size S/M/L và đơn vị giá.
- API khách hàng chỉ trả dịch vụ `active` có ít nhất một size với giá hợp lệ; giá cũ chưa chuyển đổi không được đưa vào catalog Customer. Phản hồi có `Cache-Control: no-store`, và frontend yêu cầu không dùng cache.
- CSP cho phép ảnh HTTPS do Admin quản lý; đường dẫn local được kiểm tra và ảnh lỗi/thiếu dùng placeholder theo tên dịch vụ.
- Giá, đơn vị, mô tả size và thời lượng từng size được trình bày từ dữ liệu API; Customer không có nguồn giá hoặc size hardcode.
- Khi API không tải được hoặc ảnh không hiển thị, giao diện có trạng thái lỗi hoặc placeholder chữ viết tắt theo tên dịch vụ; ảnh giữ đúng tỷ lệ bằng `object-fit`.
- Bổ sung URL cho một số dịch vụ bằng ảnh đã có sẵn trong `public/images/studio/`; các dịch vụ còn thiếu ảnh chưa được gán đường dẫn giả và tiếp tục dùng placeholder.
- Thẻ dịch vụ Customer trên trang danh sách và khu vực dịch vụ nổi bật chỉ hiển thị ảnh, nhóm, tên, mô tả ngắn (nếu có) cùng nút Tư vấn ngay/Chi tiết; không hiển thị bảng giá hoặc thời gian bên ngoài.
- Nút Chi tiết mở modal và tải mới dữ liệu từ API `GET /api/products/:id`, dùng bảng size/giá/thời lượng thực trả về. Modal báo trạng thái tải/lỗi, thông báo khi chưa có giá size, có placeholder ảnh, nút tư vấn đúng dịch vụ và bố cục cuộn phù hợp điện thoại.

## 3. Form quản lý dịch vụ

- Form tạo/sửa yêu cầu nhóm, tên, thời lượng, số nhân viên và giá cho ít nhất một size.
- Chỉ hỗ trợ giá theo size S/M/L. Cần chọn ít nhất một size và nhập giá lớn hơn 0 cho từng size được chọn; không gửi/lưu giá cho size chưa chọn.
- Khi chọn một size chưa có giá, form điền mức giá gợi ý theo tên/nhóm dịch vụ và thời lượng; người dùng có thể chỉnh sửa giá trước khi lưu. Giá đã nhập không bị ghi đè khi đổi lựa chọn size.
- Mô tả và URL ảnh minh họa không bắt buộc; URL ảnh được kiểm tra định dạng nếu có nhập.
- Chỉ hỗ trợ bật/tắt riêng các size S/M/L.
- Trường ảnh là đường dẫn URL, không tải tệp ảnh lên.
- Frontend hiển thị lỗi ngay tại trường; Backend kiểm tra lại các trường bắt buộc, nhóm dịch vụ còn hoạt động, số nguyên dương cho thời lượng/số nhân viên và mức giá lớn hơn 0.

## 4. Danh sách và chi tiết dịch vụ trong Admin/Staff

- Danh sách hiển thị thành một bảng sáu cột: mã dịch vụ, nhóm, tên, thời lượng, số nhân viên cần và thao tác.
- Mã dịch vụ được sắp xếp tăng dần trước khi phân trang.
- Có thể nhấn toàn bộ hàng để mở hoặc thu gọn chi tiết ngay bên dưới; mỗi lần chỉ mở một dịch vụ.
- Chi tiết hiển thị ảnh hoặc chữ viết tắt, thông tin dịch vụ và bảng size/loại tóc/giá từ dữ liệu dịch vụ.
- Nút Sửa và Xóa hoạt động độc lập với thao tác mở rộng; Xóa có bước xác nhận.
- Bảng có thể cuộn ngang trên màn hình nhỏ.

## 5. Mã dịch vụ tự động

- Backend tự cấp mã dạng `DV001`, `DV002`, ... khi tạo dịch vụ; mã không nhập hoặc sửa từ giao diện/API.
- Mã được lưu trực tiếp trong bản ghi dịch vụ JSON. Bộ đếm được lưu tại `database/data/service_code_sequence.json`.
- Cấp mã sử dụng khóa tệp để tuần tự hóa yêu cầu giữa nhiều tiến trình; kiểm tra mã trùng và có khôi phục trạng thái nếu ghi dịch vụ thất bại.
- Dịch vụ cũ chưa có mã được gán một lần theo thứ tự dữ liệu, không đổi mã đã cấp. Hiện tại có 42 dịch vụ với mã `DV001` đến `DV042`; mã tiếp theo là `DV043`.
- Đã kiểm tra dữ liệu hiện tại: không có mã dịch vụ trùng.

## 6. Đặt lịch và báo giá

- Luồng đặt lịch dùng dịch vụ đang hoạt động và giá/thời lượng hiện hành từ Backend.
- Backend yêu cầu size S/M/L có giá hợp lệ cho mọi dịch vụ đã chọn. Giá và thời lượng được tính lại từ tier hiện hành, không tin giá/thời lượng do Customer gửi.
- Luồng đặt lịch AI hỏi size nếu thiếu, kiểm tra size có trong dịch vụ, rồi truyền size đã chọn qua bước kiểm tra lịch, giữ chỗ và xác nhận.
- Hỗ trợ chọn size, tính giá và thời lượng theo size; dịch vụ không còn hoạt động bị từ chối khi đặt lịch.
- Luồng giữ chỗ và xác nhận được cập nhật để dùng thông tin dịch vụ mới nhất.
- Phần tư vấn giá tự động đọc danh mục hiện tại và chỉ báo giá của size đã cấu hình.
- Form thêm lịch hẹn trực tiếp trên lịch nhân viên tải danh mục dịch vụ đang hoạt động từ API quản lý dịch vụ mỗi lần mở, phân trang để nhận đủ dịch vụ và hiển thị nhóm, tên, giá các size cùng size được chọn.
- Tổng giá/thời lượng được tính theo những dịch vụ đang chọn và size tương ứng; Backend kiểm tra lại ID, trạng thái, size, giá và thời lượng từ dữ liệu hiện hành, không tin các tổng do trình duyệt gửi.
- Lịch mới lưu ID dịch vụ và snapshot tên, nhóm, size, giá, thời lượng từng dịch vụ; thay đổi danh mục sau đó không làm đổi thông tin lịch đã tạo.

## 7. Chuyển đổi dữ liệu giá cũ

- Giá legacy được lưu nguyên trong JSON để bảo toàn dữ liệu lịch sử, nhưng đã bị loại khỏi API dịch vụ và không còn được dùng làm fallback hiển thị hay tính tiền đặt lịch.
- Đã chuyển DV002 theo giá người dùng xác nhận: S 150.000đ, M 170.000đ, L 180.000đ. Đã chuyển DV003 size S 180.000đ theo giá người dùng nhập.
- Đã bổ sung dữ liệu giá mẫu VNĐ cho các size S/M/L còn thiếu trên toàn bộ 42 dịch vụ; dữ liệu hiện có giá hợp lệ không bị ghi đè. Giá mới được tạo khác nhau theo nhóm, tên và thời lượng, và giá theo size được tăng dần cho những tier vừa bổ sung.
- Giá mẫu là dữ liệu giả lập phục vụ demo, không phải báo giá salon đã xác nhận. Form tạo/sửa gợi ý giá cho size mới theo thông tin dịch vụ; giá gợi ý vẫn có thể sửa trước khi lưu.
- Giá legacy vẫn được lưu trong JSON để bảo toàn lịch sử, nhưng không xuất hiện trong API và không được dùng thay cho giá size khi hiển thị hoặc đặt lịch.
- Chuẩn hóa mô tả size S/M/L cho đủ 42 dịch vụ (126 mô tả) thành nội dung tiếng Việt chính xác. JSON được ghi UTF-8; Backend chuẩn hóa mô tả theo size khi trả dữ liệu để Admin, Staff và Customer nhận cùng nội dung.

## 8. Kiểm thử đã thực hiện

- Bộ test API dịch vụ xác nhận quyền truy cập, validation giá theo size, cập nhật dữ liệu, đặt lịch, mã tự động, sửa/xóa và kiểm tra đồng thời.
- Kiểm tra mã sau khi xóa không bị tái sử dụng, chỉnh sửa không làm đổi mã và lỗi ghi không làm tăng bộ đếm.
- Năm bộ test liên quan dịch vụ và đặt lịch đạt **43/43**: `products.test.js`, `ai_service_pricing.test.js`, `appointments.test.js`, `booking_process_salons.test.js` và `ai_booking_flow.test.js`.
- Kiểm tra cú pháp JavaScript, các script nội tuyến trong form Admin, đủ giá S/M/L cho 42 dịch vụ và `git diff --check` đều đạt.
- Browser smoke xác nhận API chỉ trả dịch vụ đang bán, phản hồi `no-store`, ảnh local được phục vụ và bảng size hiển thị dữ liệu từ API.
- Bộ test `schedule-date-navigation.test.js` đạt **15/15**, bao gồm lùi/tới ngày, ranh giới tháng/năm, năm nhuận, ngày không hợp lệ, date picker, nút Hôm nay và bỏ qua phản hồi tải lịch cũ.
- Bộ test `appointment-service-sync.test.js` đạt **14/14**, kiểm tra form/API danh mục, phân trang, thay đổi dịch vụ, chọn nhiều/bỏ chọn, giá và thời lượng theo size, kiểm tra trạng thái/ID và bảo toàn snapshot lịch cũ.

## 9. Danh sách file đã thay đổi

### Thương hiệu và giao diện

- `public/admin/admin.js`: tên salon trong phần điều hướng/quản trị.
- `public/admin/appointments.html`: tiêu đề và tên salon ở trang lịch hẹn.
- `public/admin/chat.html`: tên salon ở trang chat Admin.
- `public/admin/dashboard.html`: tên salon ở trang tổng quan.
- `public/admin/login.html`: tên salon trên màn hình đăng nhập.
- `public/admin/settings.html`: tên salon và thông tin cài đặt.
- `public/chat.html`: tên salon trên trang chat khách hàng.
- `public/index.html`: thương hiệu và nội dung trang chủ khách hàng; lấy catalog dịch vụ từ API.
- `public/js/chat.js`: nội dung chat/nhận diện tên salon.
- `database/data/system_settings.json`: giá trị cài đặt tên salon.

### Quản lý và đồng bộ dịch vụ

- `public/admin/products.html`: form thêm/sửa chỉ có size S/M/L, validation và giá gợi ý theo size, bảng sáu cột và chi tiết mở rộng.
- `public/admin/staff.html`: dịch vụ và size được tải từ nguồn chung trong các thao tác của Staff; form tạo lịch tải mới danh mục, hiển thị nhóm/giá/thời lượng theo size và tính tổng từ lựa chọn.
- `public/admin/appointment-services.js`: tải toàn bộ danh mục qua API phân trang, tính tổng giá/thời lượng và cung cấp trạng thái danh mục rỗng cho form tạo lịch.
- `public/js/api.js`: phương thức gọi API dùng ở giao diện khách hàng.
- `public/js/product-catalog.js`: thẻ dịch vụ gọn; modal chi tiết lấy dữ liệu dịch vụ và giá từ API.
- `public/css/main.css`: bố cục card gọn, tỷ lệ ảnh/placeholder và modal/bảng giá size responsive.
- `public/products.html`: trang danh sách dịch vụ khách hàng dùng dữ liệu động.
- `public/product-detail.html`: trang chi tiết dịch vụ đọc dữ liệu từ API.
- `src/app.js`: CSP cho phép ảnh HTTPS từ URL dịch vụ.
- `src/config/jsonStore.js`: cơ chế lưu/đọc dữ liệu JSON dùng chung.
- `src/repositories/productRepository.js`: đọc/ghi dịch vụ, chuẩn hóa mô tả size cho API, lọc Customer theo giá size hợp lệ, mã DV tự tăng và sắp xếp mã.
- `src/routes/products.js`: API dịch vụ, quyền Admin/Staff/Customer và kiểm tra dữ liệu ở Backend.

### Đặt lịch và tư vấn giá

- `src/repositories/appointmentRepository.js`: tra giá, size và thời lượng hiện hành; xác thực dịch vụ/size khi tạo lịch và lưu snapshot dịch vụ tại thời điểm đặt lịch.
- `src/ai/orchestrator.js`: yêu cầu/kiểm tra size và truyền lựa chọn size xuyên suốt luồng đặt lịch AI.
- `src/routes/appointments.js`: kiểm tra dịch vụ khi tạo/cập nhật lịch hẹn.
- `src/services/appointmentService.js`: xử lý dịch vụ trong luồng đặt lịch.
- `src/ai/servicePricing.js`: tra giá dịch vụ/size theo catalog hiện hành.
- `src/ai/tools.js`: cung cấp dữ liệu dịch vụ cho công cụ tư vấn.

### Kiểm thử và tài liệu

- `tests/products.test.js`: kiểm tra quyền, đồng bộ, mã dịch vụ, mô tả size UTF-8, giá mẫu S/M/L, card Customer gọn, modal chi tiết lấy API, validation và đặt lịch.
- `tests/ai_service_pricing.test.js`: kiểm tra tư vấn giá theo catalog.
- `tests/ai_booking_flow.test.js`: kiểm tra luồng hỏi size, giữ chỗ và xác nhận dịch vụ tính theo size.
- `tests/appointment-service-sync.test.js`: kiểm tra đồng bộ form lịch hẹn với repository dịch vụ và snapshot lịch.
- `tests/schedule-date-navigation.test.js`: kiểm tra chuyển ngày trong lịch nhân viên, xử lý ngày hợp lệ/ranh giới lịch và đồng bộ giao diện khi đổi ngày.
- `docs/TONG-HOP-THAY-DOI.md`: tài liệu tổng hợp thay đổi và danh sách file.

### Điều hướng lịch nhân viên theo ngày

- `public/admin/staff.html`: dùng ngày địa phương cho ngày mặc định và nút Hôm nay; nút lùi/tới và bộ chọn ngày cập nhật nhãn, tải lịch theo ngày đã chọn, đồng thời bỏ qua phản hồi của yêu cầu cũ khi người dùng chuyển ngày liên tục.
- `public/admin/schedule-date.js`: xử lý chuyển ngày và định dạng nhãn theo UTC để tránh lệch ngày do múi giờ; từ chối ngày không hợp lệ.
- `tests/schedule-date-navigation.test.js`: bổ sung 15 kiểm thử cho logic ngày và hành vi điều hướng lịch.

### Dữ liệu JSON và bộ đếm mã

- `database/data/products.json`: dữ liệu dịch vụ hiện tại; đã lưu mã DV, URL ảnh thật cho một số dịch vụ, mô tả size UTF-8 chính xác, giá người dùng cung cấp và giá mẫu S/M/L cho các tier còn thiếu. Các trường giá legacy chưa bị xóa.
- `database/data/service_code_sequence.json`: bộ đếm mã dịch vụ tiếp theo.
- `database/data/system_settings.json`: dữ liệu cấu hình tên salon.
- `database/data/appointments.json`: dữ liệu lịch hẹn hiện có.
- `database/data/conversations.json`: dữ liệu hội thoại hiện có.
- `database/data/messages.json`: dữ liệu tin nhắn hiện có.
- `database/data/notifications.json`: dữ liệu thông báo hiện có.
- `database/data/users.json`: dữ liệu người dùng hiện có.

> Danh sách này ghi nhận các file đang có thay đổi trong workspace cho phần công việc trên. Các file JSON là dữ liệu runtime/seed, không phải mã nguồn; cần xem xét dữ liệu thực tế trước khi đưa vào commit hoặc triển khai.
