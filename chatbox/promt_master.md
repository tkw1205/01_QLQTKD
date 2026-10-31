# MASTER PROMPT: XÂY DỰNG WEBSITE TƯ VẤN, CHAT AI, CHAT NHÂN VIÊN VÀ ĐẶT LỊCH TỪ CON SỐ 0

## 1. VAI TRÒ VÀ NHIỆM VỤ

Bạn là Senior Full-stack Developer, Software Architect và DevOps Engineer.

Nhiệm vụ của bạn là trực tiếp xây dựng một website hoàn chỉnh từ con số 0, bao gồm:

- Frontend (FE).
- Backend (BE).
- Database (DB).
- Tích hợp AI Chat.
- Chức năng đặt lịch tư vấn qua AI.
- Chức năng chuyển từ AI sang chat trực tiếp với nhân viên Admin.
- Giao diện quản trị.
- Docker và Docker Compose.
- Kiểm thử, tài liệu cài đặt và hướng dẫn sử dụng.

Hiện tại tôi chưa có bất kỳ source code nào, chưa có FE, BE hay DB. Bạn phải tự khởi tạo toàn bộ dự án và tạo các file cần thiết.

Đây không phải yêu cầu chỉ viết tài liệu, đề xuất kiến trúc hoặc cung cấp các đoạn code mẫu. Bạn phải trực tiếp tạo mã nguồn thực tế trong workspace mà bạn được cấp quyền truy cập, hoàn thiện các chức năng và kiểm thử chúng.

Nếu môi trường hỗ trợ terminal, hãy sử dụng terminal để cài đặt dependencies, khởi động Docker, chạy migration, kiểm thử API và sửa lỗi. Không tuyên bố đã chạy thành công nếu chưa thực sự kiểm tra.

Không dừng lại ở việc đưa ra kế hoạch. Hãy lập kế hoạch ngắn gọn, sau đó triển khai dự án theo từng giai đoạn cho đến khi đạt tiêu chí hoàn thành.

Nếu gặp một thông tin chưa được xác định, hãy chọn phương án mặc định hợp lý, an toàn và dễ mở rộng, ghi lại trong README và tiếp tục thực hiện. Chỉ hỏi tôi khi thiếu thông tin thực sự không thể giải quyết bằng một mặc định hợp lý.

---

# 2. MỤC TIÊU SẢN PHẨM

Xây dựng website cho phép khách hàng:

1. Truy cập website và xem danh sách mặt hàng.
2. Tìm kiếm và xem thông tin chi tiết mặt hàng.
3. Chat với AI để được tư vấn.
4. Yêu cầu AI kiểm tra lịch trống và đặt lịch tư vấn trực tiếp trong hội thoại.
5. Xác nhận lịch hẹn và nhận mã lịch hẹn thực tế.
6. Bấm nút chuyển từ chat AI sang chat trực tiếp với nhân viên Admin.
7. Nhắn tin qua lại với nhân viên theo thời gian thực.
8. Tiếp tục cuộc hội thoại mà không mất lịch sử chat AI.
9. Tra cứu lịch hẹn của mình bằng cơ chế xác minh an toàn.

Admin và nhân viên có thể:

1. Đăng nhập hệ thống quản trị.
2. Quản lý mặt hàng.
3. Quản lý lịch hẹn.
4. Tiếp nhận và trả lời các cuộc chat từ khách hàng.
5. Theo dõi danh sách cuộc chat đang chờ và đang xử lý.
6. Quản lý tài khoản nhân viên và quyền truy cập.
7. Cấu hình giờ làm việc, thời lượng tư vấn và các thiết lập liên quan.
8. Theo dõi các trạng thái và thông tin cần thiết để vận hành website.

Website phải có thể chạy trên Docker, có database lưu trữ dữ liệu bền vững và có hướng dẫn khởi chạy rõ ràng.

---

# 3. CÔNG NGHỆ BẮT BUỘC

## 3.1. Frontend

Sử dụng:

- HTML5.
- CSS3.
- JavaScript thuần.
- Fetch API để gọi REST API.
- Socket.IO Client để nhận và gửi tin nhắn thời gian thực.
- Responsive cho desktop, tablet và điện thoại.

Không sử dụng React, Vue, Angular hoặc framework frontend phức tạp.

Có thể sử dụng thư viện JavaScript nhỏ nếu thực sự cần thiết, nhưng ưu tiên mã nguồn đơn giản, dễ đọc, dễ sửa và dễ bảo trì.

Frontend phải được phục vụ thông qua ứng dụng Node.js hoặc cơ chế reverse proxy phù hợp.

## 3.2. Backend

Sử dụng:

- Node.js phiên bản LTS phù hợp tại thời điểm triển khai.
- Express.js.
- REST API.
- Socket.IO.
- PostgreSQL driver hoặc ORM phù hợp.
- Validation dữ liệu đầu vào.
- Middleware xác thực và phân quyền.
- Logging và xử lý lỗi tập trung.

Tổ chức code thành các module rõ ràng, chẳng hạn:

- Routes.
- Controllers.
- Services.
- Repositories hoặc database layer.
- Middleware.
- Validators.
- AI tools và AI orchestration.
- Socket handlers.
- Configuration.
- Utilities.

Không gom toàn bộ logic vào một file JavaScript duy nhất.

## 3.3. Database

Sử dụng PostgreSQL.

Yêu cầu:

- Có schema database rõ ràng.
- Có migration để tạo và cập nhật cấu trúc database.
- Có seed dữ liệu mẫu.
- Có khóa chính, khóa ngoại, index và ràng buộc phù hợp.
- Có cơ chế lưu dữ liệu bền vững bằng Docker volume.
- Có phương án sao lưu và phục hồi database cơ bản.
- Không lưu dữ liệu nghiệp vụ quan trọng chỉ trong bộ nhớ của ứng dụng.

Có thể chọn Prisma, Drizzle hoặc thư viện phù hợp khác. Hãy chọn một giải pháp nhất quán và không sử dụng nhiều ORM cùng lúc nếu không cần thiết.

## 3.4. Docker

Sử dụng Docker và Docker Compose.

Tạo tối thiểu:

- Dockerfile.
- docker-compose.yml.
- .dockerignore.
- .env.example.
- README.md.

Docker Compose phải khởi chạy được các thành phần cần thiết của ứng dụng, bao gồm:

- Web application Node.js.
- PostgreSQL.

Có thể tách thêm service nếu thực sự cần thiết.

Yêu cầu Docker:

- PostgreSQL chạy trong container riêng.
- Có volume lưu database.
- Có healthcheck cho PostgreSQL.
- Backend chờ database sẵn sàng trước khi khởi tạo kết nối.
- Có xử lý retry kết nối khi cần.
- Sử dụng mạng nội bộ Docker cho giao tiếp giữa các service.
- Không hardcode mật khẩu hoặc API key trong source code.
- Có cấu hình môi trường development và hướng dẫn triển khai an toàn.
- Không yêu cầu cài Node.js hoặc PostgreSQL trực tiếp trên máy host để chạy ứng dụng thông thường; người dùng chỉ cần Docker và Docker Compose.
- Có hướng dẫn xử lý trường hợp cổng mặc định bị trùng.
- Không xóa dữ liệu database khi restart hoặc rebuild container thông thường.

Cung cấp các lệnh khởi chạy, xem log, dừng hệ thống và khởi động lại.

## 3.5. Tích hợp AI

Thiết kế một lớp AI provider độc lập với logic nghiệp vụ.

Cho phép cấu hình bằng biến môi trường:

- AI provider.
- Base URL hoặc endpoint.
- API key nếu cần.
- Model name.
- Temperature hoặc tham số phù hợp.
- Timeout và giới hạn retry.

Ưu tiên khả năng kết nối mô hình AI local thông qua API tương thích OpenAI.

Không giả định mọi mô hình local đều hỗ trợ tool calling. Nếu mô hình không hỗ trợ trực tiếp, hãy xây dựng cơ chế trung gian có kiểm tra dữ liệu và quyền thực thi ở backend.

AI phải có khả năng gọi các công cụ nghiệp vụ được backend cho phép, đặc biệt là kiểm tra giờ trống và tạo lịch hẹn.

Không cho phép AI thực thi SQL tùy ý hoặc tự truy cập toàn bộ database.

Nếu chưa cấu hình AI provider, website vẫn phải khởi động được. Hiển thị thông báo rõ ràng rằng AI chưa được cấu hình, đồng thời cho phép kiểm thử các chức năng không phụ thuộc AI.

Không giả lập câu trả lời AI thật khi chưa có mô hình hoạt động.

Lưu ý về Docker networking: nếu mô hình AI chạy trên máy host, không mặc định rằng localhost bên trong container chính là máy host. Hướng dẫn cấu hình endpoint phù hợp với hệ điều hành và môi trường triển khai.

---

# 4. KIẾN TRÚC TỔNG THỂ

Thiết kế theo mô hình:

Frontend
→ Node.js / Express Backend
→ Service nghiệp vụ
→ PostgreSQL

Đối với AI:

Khách hàng
→ Chat API
→ AI Orchestrator
→ Các công cụ nghiệp vụ được cho phép
→ Backend kiểm tra dữ liệu và quyền
→ Database
→ Kết quả trả về AI
→ Câu trả lời cho khách hàng

Đối với chat nhân viên:

Khách hàng
→ Socket.IO / Chat API
→ Backend xác thực và kiểm tra quyền
→ Cuộc hội thoại trong database
→ Nhân viên Admin nhận tin nhắn thời gian thực

Frontend không được truy cập database trực tiếp.

Mọi dữ liệu trả về frontend phải được kiểm tra quyền và loại bỏ thông tin nội bộ không được phép công khai.

Tách biệt rõ:

- Trạng thái cuộc hội thoại.
- Trạng thái tiếp nhận của nhân viên.
- Trạng thái lịch hẹn.
- Trạng thái đăng nhập.
- Trạng thái kết nối Socket.IO.

Không dùng một trường trạng thái duy nhất để biểu diễn tất cả các quy trình trên.

---

# 5. CHỨC NĂNG WEBSITE KHÁCH HÀNG

## FE-01. Trang chủ

Bao gồm:

- Logo và tên website.
- Menu điều hướng.
- Giới thiệu ngắn về dịch vụ.
- Danh sách mặt hàng nổi bật.
- Nút xem danh sách mặt hàng.
- Nút bắt đầu tư vấn.
- Nút mở cửa sổ chat.
- Thông tin liên hệ cơ bản.

Thiết kế gọn gàng, hiện đại, dễ sử dụng.

## FE-02. Danh sách mặt hàng

Bao gồm:

- Hiển thị danh sách mặt hàng dạng thẻ.
- Hình ảnh.
- Tên mặt hàng.
- Giá nếu có.
- Mô tả ngắn.
- Trạng thái kinh doanh.
- Tìm kiếm theo tên.
- Lọc theo danh mục.
- Phân trang nếu cần.
- Nút xem chi tiết.

Dữ liệu phải lấy từ backend, không hardcode danh sách mặt hàng trong frontend.

## FE-03. Chi tiết mặt hàng

Bao gồm:

- Tên mặt hàng.
- Hình ảnh.
- Giá.
- Mô tả.
- Danh mục.
- Các thông tin liên quan.
- Nút chat tư vấn về mặt hàng.

Khi khách bắt đầu chat từ trang chi tiết, hệ thống có thể đưa thông tin mặt hàng vào ngữ cảnh để AI hiểu khách đang quan tâm đến sản phẩm nào.

Backend phải tự xác minh mã mặt hàng hợp lệ. Không tin tưởng hoàn toàn thông tin mặt hàng do frontend hoặc AI tự gửi lên.

## FE-04. Giao diện chat khách hàng

Đây là chức năng trọng tâm của website.

Giao diện phải có:

- Danh sách tin nhắn.
- Phân biệt tin nhắn của khách hàng, AI và nhân viên.
- Ô nhập tin nhắn.
- Nút gửi.
- Hiển thị thời gian tin nhắn.
- Trạng thái đang xử lý.
- Trạng thái gửi thành công hoặc thất bại.
- Khả năng tải lịch sử hội thoại.
- Nút chuyển sang nhân viên tư vấn.
- Trạng thái cuộc chat hiện tại.
- Hiển thị thông báo khi có nhân viên tham gia.
- Giữ nội dung hội thoại khi tải lại trang nếu quyền truy cập vẫn hợp lệ.

Nếu đang chat với AI, giao diện hiển thị rõ chế độ AI.

Nếu đang chat với nhân viên, giao diện hiển thị rõ chế độ nhân viên.

Không để khách nhầm lẫn giữa phản hồi AI và phản hồi của người thật.

## FE-05. Đặt lịch thông qua AI

Không bắt buộc tạo trang đặt lịch riêng.

Ưu tiên để khách hàng hoàn thành toàn bộ quy trình trong chat bằng ngôn ngữ tự nhiên.

Ví dụ:

Khách hàng:
"Tôi muốn đặt lịch tư vấn vào chiều mai."

AI:
"Bạn muốn tư vấn về mặt hàng nào?"

Khách hàng:
"Tôi muốn tư vấn về mặt hàng A."

AI:
"Để tôi kiểm tra lịch trống vào chiều mai."

Backend kiểm tra database và trả về những khung giờ còn trống.

AI:
"Hiện còn các khung giờ 14:00 và 15:30. Bạn muốn chọn giờ nào?"

Khách hàng:
"14 giờ."

AI thu thập các thông tin bắt buộc còn thiếu, tóm tắt thông tin lịch hẹn và yêu cầu khách xác nhận.

Sau khi khách xác nhận, AI gọi công cụ tạo lịch hẹn thông qua backend.

Chỉ khi backend xác nhận tạo lịch thành công, AI mới thông báo:

"Lịch tư vấn của bạn đã được đặt thành công. Mã lịch hẹn: ..."

Đây là ví dụ minh họa. AI phải có khả năng xử lý các cách diễn đạt tự nhiên khác, không phụ thuộc vào một kịch bản hội thoại cố định.

## FE-06. Tra cứu lịch hẹn

Cho phép khách:

- Tra cứu lịch hẹn đã đặt.
- Xem mã lịch hẹn.
- Xem ngày giờ.
- Xem trạng thái.
- Xem nội dung tư vấn.
- Đổi hoặc hủy lịch nếu hệ thống cho phép.

Phải có cơ chế xác minh quyền sở hữu lịch hẹn. Không được cho phép truy cập lịch của người khác chỉ bằng mã lịch hẹn.

---

# 6. CHỨC NĂNG BẮT BUỘC: SWITCH TỪ CHAT AI SANG CHAT TRỰC TIẾP VỚI NHÂN VIÊN ADMIN

Đây là yêu cầu cốt lõi, không được bỏ qua hoặc thay thế bằng nút liên hệ, biểu mẫu hoặc chức năng để lại thông tin.

## 6.1. Nút chuyển sang nhân viên

Trên giao diện chat khách hàng, luôn hiển thị nút:

"Chat với nhân viên tư vấn"

Khi khách nhấn nút, frontend phải gửi yêu cầu chuyển kênh đến backend.

Backend phải thực hiện việc chuyển đổi thực sự, không chỉ thay đổi giao diện.

## 6.2. Luồng switch

1. Khách đang chat với AI.
2. Khách nhấn "Chat với nhân viên tư vấn".
3. Frontend gửi yêu cầu chuyển kênh.
4. Backend xác thực quyền truy cập cuộc hội thoại.
5. Backend cập nhật chế độ hội thoại sang chờ nhân viên.
6. Hệ thống tìm nhân viên có quyền và đang sẵn sàng tiếp nhận.
7. Nếu có nhân viên phù hợp, gán cuộc hội thoại cho nhân viên theo cơ chế an toàn.
8. Nếu chưa có nhân viên, giữ cuộc hội thoại trong hàng đợi.
9. Giao diện khách hàng chuyển sang chế độ chờ hoặc chat trực tiếp tùy trạng thái thực tế.
10. Nhân viên nhìn thấy yêu cầu trong giao diện quản trị.
11. Nhân viên tiếp nhận cuộc hội thoại.
12. Khách và nhân viên nhắn tin qua lại theo thời gian thực.
13. Toàn bộ lịch sử chat AI vẫn được giữ nguyên.

Không được báo rằng khách đã kết nối với nhân viên nếu chưa có nhân viên thực sự tiếp nhận.

## 6.3. Chat trực tiếp với nhân viên

Sử dụng Socket.IO cho giao tiếp thời gian thực.

Khi nhân viên tiếp nhận cuộc hội thoại:

- Khách có thể gửi tin nhắn.
- Nhân viên có thể trả lời.
- Tin nhắn được lưu vào database.
- Tin nhắn mới được đẩy đến đúng người có quyền xem.
- Có trạng thái gửi và nhận tin nhắn phù hợp.
- Có thể tải lại trang và tiếp tục cuộc hội thoại.
- Tin nhắn phải được gắn đúng người gửi và cuộc hội thoại.
- Không phát tán tin nhắn sang các phòng chat khác.
- Backend phải xác thực quyền trước khi cho phép tham gia room Socket.IO.

Không coi Socket.IO room là cơ chế phân quyền duy nhất.

Nếu khách đang chat với nhân viên, AI không được tự động trả lời xen vào cuộc hội thoại trực tiếp.

## 6.4. Xử lý khi không có nhân viên

Nếu không có nhân viên sẵn sàng:

- Chuyển cuộc hội thoại sang trạng thái chờ.
- Hiển thị thông báo rõ ràng cho khách.
- Không giả vờ có nhân viên đang trả lời.
- Cho phép khách tiếp tục chờ.
- Cho phép khách quay lại chat AI.
- Không mất lịch sử hội thoại hoặc thông tin đặt lịch đang xử lý.

Nếu khách quay lại AI, backend phải kiểm tra trạng thái và thực hiện chuyển đổi hợp lệ.

## 6.5. Quản lý cuộc hội thoại

Mỗi cuộc hội thoại phải có định danh ổn định.

Không tạo cuộc hội thoại mới chỉ vì khách chuyển từ AI sang nhân viên.

Giữ nguyên:

- Lịch sử tin nhắn.
- Thông tin khách hàng.
- Mặt hàng đang được tư vấn.
- Thông tin lịch hẹn liên quan.
- Trạng thái quy trình đặt lịch nếu có.
- Thông tin cần thiết để nhân viên tiếp tục hỗ trợ.

Phân biệt rõ vai trò người gửi:

- `user`.
- `assistant`.
- `agent`.
- `system` nếu thực sự cần thiết.

Tin nhắn do nhân viên gửi phải được nhận diện là tin nhắn của nhân viên, không phải phản hồi của AI.

## 6.6. Trạng thái hội thoại

Thiết kế các trạng thái phù hợp, ví dụ:

- `ai`: Đang chat với AI.
- `waiting_for_agent`: Đang chờ nhân viên.
- `human`: Đang chat với nhân viên.
- `closed`: Cuộc hội thoại đã kết thúc.

Có thể bổ sung trạng thái khác nếu cần, nhưng phải giải thích ý nghĩa và cách chuyển đổi hợp lệ.

Không để AI tự quyết định quyền chuyển trạng thái bằng nội dung văn bản. Backend mới là nơi thực hiện và xác nhận chuyển trạng thái.

## 6.7. Quy tắc tiếp nhận

- Không cho nhiều nhân viên cùng tiếp nhận một cuộc hội thoại ngoài ý muốn.
- Khi nhiều nhân viên bấm nhận đồng thời, backend phải bảo đảm chỉ một thao tác hợp lệ.
- Nhân viên chỉ được xem cuộc hội thoại theo quyền hạn.
- Không để khách truy cập cuộc hội thoại của khách khác.
- Có cơ chế kết thúc tư vấn.
- Có cơ chế xử lý khi nhân viên mất kết nối.
- Có thể cho phép Admin chuyển cuộc hội thoại sang nhân viên khác.
- Không xóa lịch sử khi kết thúc tư vấn.

---

# 7. GIAO DIỆN QUẢN TRỊ ADMIN

## AD-01. Đăng nhập

- Đăng nhập bằng tài khoản nhân viên.
- Đăng xuất.
- Kiểm tra phiên đăng nhập.
- Phân quyền Admin và nhân viên.
- Bảo vệ các trang quản trị và API.

Không tạo một tài khoản Admin mặc định với mật khẩu yếu hoặc mật khẩu cố định trong source code.

Cung cấp cơ chế tạo Admin ban đầu bằng biến môi trường hoặc lệnh khởi tạo an toàn. Không tạo tài khoản quản trị nếu cấu hình bắt buộc còn thiếu.

## AD-02. Dashboard

Hiển thị:

- Tổng số mặt hàng.
- Tổng số lịch hẹn.
- Lịch hẹn đang chờ xử lý.
- Lịch hẹn sắp diễn ra.
- Số cuộc hội thoại đang chờ nhân viên.
- Số cuộc hội thoại đang được xử lý.

Các số liệu phải lấy từ database.

## AD-03. Quản lý mặt hàng

- Xem danh sách.
- Tìm kiếm.
- Lọc theo danh mục.
- Thêm mặt hàng.
- Chỉnh sửa mặt hàng.
- Ẩn hoặc ngừng kinh doanh mặt hàng.
- Quản lý giá, mô tả và trạng thái.
- Quản lý ảnh nếu chức năng tải ảnh được triển khai.

Có xác thực và phân quyền cho mọi thao tác.

## AD-04. Quản lý lịch hẹn

- Xem danh sách lịch hẹn.
- Tìm kiếm theo mã lịch.
- Lọc theo ngày và trạng thái.
- Xem chi tiết lịch.
- Xác nhận lịch.
- Đổi lịch.
- Hủy lịch.
- Cập nhật trạng thái tư vấn.
- Xem thông tin nhân viên phụ trách.
- Kiểm tra xung đột trước khi thay đổi lịch.

Mọi thay đổi phải được xử lý ở backend và ghi vào database.

## AD-05. Quản lý chat trực tiếp

Đây là màn hình quan trọng, phải triển khai thực tế.

Giao diện gồm:

- Danh sách chat đang chờ nhân viên.
- Danh sách chat đang được xử lý.
- Danh sách chat đã kết thúc.
- Nội dung cuộc hội thoại được chọn.
- Lịch sử tin nhắn AI và nhân viên.
- Thông tin khách hàng được phép truy cập.
- Nút "Tiếp nhận cuộc hội thoại".
- Nút "Kết thúc tư vấn".
- Nút chuyển cuộc hội thoại sang nhân viên khác dành cho Admin nếu có.
- Trạng thái kết nối và trạng thái xử lý.
- Thông báo khi có chat mới.
- Tin nhắn mới được cập nhật theo thời gian thực.

Khi nhân viên nhận cuộc hội thoại, khách phải nhận được cập nhật trạng thái tương ứng.

Không được chỉ xây dựng giao diện tĩnh hoặc dữ liệu giả.

## AD-06. Quản lý tài khoản nhân viên

- Tạo tài khoản nhân viên.
- Kích hoạt hoặc vô hiệu hóa tài khoản.
- Gán vai trò.
- Phân quyền.
- Quản lý trạng thái sẵn sàng tiếp nhận chat nếu cần.
- Không cho nhân viên tự nâng quyền.
- Không cho tài khoản bị vô hiệu hóa tiếp tục truy cập hệ thống.

## AD-07. Cấu hình hệ thống

Cho phép Admin quản lý các cấu hình nghiệp vụ cần thiết:

- Tên website.
- Thông tin liên hệ.
- Giờ làm việc.
- Ngày nghỉ.
- Thời lượng mỗi buổi tư vấn.
- Khoảng thời gian nghỉ giữa các buổi.
- Thời gian đặt trước tối thiểu.
- Khoảng thời gian được phép đặt lịch.
- Chính sách hủy và đổi lịch.
- Các thiết lập AI không nhạy cảm.
- Nội dung hướng dẫn AI hoặc dữ liệu kiến thức được phép quản lý.

API key và bí mật hệ thống không được hiển thị công khai hoặc gửi về frontend.

---

# 8. THIẾT KẾ AI AGENT VÀ CÔNG CỤ NGHIỆP VỤ

AI phải có khả năng thực hiện các hành động nghiệp vụ được cấp phép, thay vì chỉ sinh ra câu trả lời văn bản.

Xây dựng AI orchestration layer để quản lý:

- Tin nhắn của khách.
- Ngữ cảnh hội thoại.
- Lịch sử tin nhắn.
- Công cụ được phép gọi.
- Kết quả công cụ.
- Giới hạn số lần gọi công cụ.
- Timeout.
- Xử lý lỗi.
- Trạng thái hội thoại.
- Trạng thái đặt lịch.
- Quy tắc chuyển sang nhân viên.

## 8.1. Công cụ kiểm tra giờ làm việc

Tên gợi ý: `get_business_hours`

Chức năng:

- Lấy giờ làm việc.
- Lấy ngày nghỉ.
- Lấy thời lượng tư vấn.
- Lấy các quy tắc đặt lịch.
- Trả dữ liệu theo cấu trúc rõ ràng.

## 8.2. Công cụ kiểm tra lịch trống

Tên gợi ý: `check_available_slots`

Đầu vào có thể bao gồm:

- Ngày yêu cầu.
- Khoảng giờ mong muốn.
- Thời lượng tư vấn nếu được phép lựa chọn.
- Mặt hàng hoặc loại tư vấn liên quan.

Backend phải:

- Kiểm tra ngày và giờ hợp lệ.
- Kiểm tra giờ làm việc.
- Kiểm tra ngày nghỉ.
- Đọc lịch hẹn hiện có.
- Phát hiện xung đột thời gian.
- Trả về các khung giờ thực sự còn trống.

AI không được tự tạo danh sách giờ trống dựa trên suy đoán.

## 8.3. Công cụ tạo lịch

Tên gợi ý: `create_appointment`

Đầu vào bao gồm những trường cần thiết để tạo lịch theo schema backend.

Backend phải:

1. Kiểm tra dữ liệu.
2. Xác thực quyền.
3. Xác minh khách đã xác nhận thông tin lịch hẹn.
4. Kiểm tra lại lịch trống.
5. Chống xung đột khi có nhiều yêu cầu đồng thời.
6. Ghi lịch hẹn bằng giao dịch database phù hợp.
7. Trả kết quả thực tế.
8. Trả mã lịch hẹn nếu thành công.

Không cho phép AI gọi công cụ tạo lịch chỉ vì AI tự suy luận rằng khách có vẻ đồng ý.

Việc xác nhận phải dựa trên bước xác nhận rõ ràng trong luồng nghiệp vụ và được backend kiểm tra. Không tin tưởng một cờ `confirmed=true` do mô hình AI tự gửi lên mà không có trạng thái xác nhận hợp lệ từ hệ thống.

## 8.4. Công cụ đổi và hủy lịch

Tên gợi ý:

- `get_appointment_details`.
- `reschedule_appointment`.
- `cancel_appointment`.

Các công cụ này phải:

- Xác thực quyền sở hữu hoặc quyền quản trị.
- Kiểm tra chính sách đổi/hủy.
- Kiểm tra lịch trống mới nếu đổi lịch.
- Yêu cầu xác nhận trước thao tác có tác động.
- Ghi nhận kết quả thực tế.
- Không sửa lịch của khách hàng khác.

## 8.5. Giới hạn quyền AI

AI chỉ được sử dụng các công cụ đã đăng ký và được backend cho phép.

Không cho phép:

- Chạy SQL do AI tự sinh.
- Xóa dữ liệu tùy ý.
- Tự thay đổi quyền người dùng.
- Tự thay đổi cấu hình bảo mật.
- Đọc mật khẩu, API key hoặc dữ liệu nhạy cảm không liên quan.
- Tự xác nhận thao tác thành công khi backend chưa trả kết quả.

Nếu mô hình local không hỗ trợ tool calling, xây dựng lớp adapter có kiểm tra schema và danh sách hành động cho phép. Backend phải xác thực mọi yêu cầu trước khi thực thi.

---

# 9. QUY TRÌNH ĐẶT LỊCH CHI TIẾT

Triển khai quy trình theo từng bước.

## Bước 1: Hiểu ý định

AI nhận biết các yêu cầu như:

- Tôi muốn đặt lịch tư vấn.
- Mai tôi muốn gặp nhân viên.
- Đặt lịch lúc 14 giờ ngày mai.
- Cuối tuần này còn giờ nào?
- Tôi muốn đổi lịch.
- Tôi muốn hủy lịch.

AI phải hiểu cách diễn đạt tự nhiên, đồng thời sử dụng múi giờ được cấu hình cho website.

Không được nhầm ngày tương đối như "ngày mai", "thứ Hai tuần sau" hoặc "cuối tuần này".

## Bước 2: Thu thập thông tin

Thu thập các trường bắt buộc theo chính sách của hệ thống, ví dụ:

- Tên khách.
- Thông tin liên hệ.
- Ngày hẹn.
- Giờ hẹn.
- Nội dung tư vấn.
- Mặt hàng liên quan nếu có.

Nếu đã có thông tin hợp lệ trong hội thoại, không hỏi lại không cần thiết.

Nếu thiếu thông tin, hỏi khách một cách tự nhiên và từng bước.

Không tự bịa tên, số điện thoại hoặc thời gian khách chưa cung cấp.

## Bước 3: Tra cứu giờ trống

AI gọi công cụ kiểm tra lịch trống.

Backend đọc database và trả kết quả thực tế.

Nếu không còn lịch phù hợp:

- Giải thích ngắn gọn.
- Đề xuất các khung giờ còn trống.
- Không tạo lịch hẹn.

## Bước 4: Xác nhận thông tin

AI tóm tắt:

- Ngày.
- Giờ.
- Nội dung tư vấn.
- Thông tin khách.
- Các chi tiết quan trọng khác.

Sau đó yêu cầu khách xác nhận rõ ràng.

Nếu khách thay đổi bất kỳ thông tin quan trọng nào, kiểm tra lại lịch và yêu cầu xác nhận thông tin mới.

## Bước 5: Tạo lịch thực tế

Sau khi có xác nhận hợp lệ:

- Backend kiểm tra lại lịch.
- Backend chống đặt trùng.
- Backend ghi dữ liệu vào database.
- Backend trả mã lịch và trạng thái.
- AI thông báo đúng theo kết quả đó.

Nếu tạo lịch thất bại, AI phải thông báo chưa đặt thành công và hướng dẫn khách chọn phương án khác.

Không được tạo lịch trùng do khách bấm nhiều lần hoặc gửi nhiều yêu cầu.

## Bước 6: Hoàn tất

Khi thành công:

- Hiển thị mã lịch hẹn.
- Hiển thị ngày giờ.
- Lưu liên kết giữa cuộc hội thoại và lịch hẹn.
- Cho phép khách tra cứu lịch sau này bằng cơ chế xác minh phù hợp.

Không yêu cầu khách phải đăng nhập nếu phiên bản đầu được thiết kế cho khách vãng lai. Tuy nhiên, phải có cách bảo vệ dữ liệu lịch hẹn của họ.

---

# 10. DATABASE SCHEMA

Thiết kế database PostgreSQL dựa trên các module nghiệp vụ.

Các bảng dự kiến gồm:

## 10.1. Tài khoản và phân quyền

- `users`: tài khoản khách hàng hoặc nhân viên theo thiết kế phù hợp.
- `roles` hoặc cơ chế vai trò tương đương.
- Bảng phiên đăng nhập hoặc cơ chế lưu session nếu cần.

Không lưu mật khẩu dạng văn bản thuần.

## 10.2. Mặt hàng

- `categories`: danh mục.
- `products`: thông tin mặt hàng.
- Có thể có bảng ảnh mặt hàng nếu cần.

## 10.3. Chat

- `conversations`: thông tin cuộc hội thoại.
- `messages`: lịch sử tin nhắn.
- `conversation_assignments` hoặc cấu trúc tương đương nếu cần quản lý việc tiếp nhận và chuyển giao.
- Có thể có bảng lưu trạng thái quy trình đặt lịch đang diễn ra.

## 10.4. Lịch hẹn

- `appointments`: thông tin lịch hẹn.
- Có thể có bảng lịch làm việc hoặc ngày nghỉ nếu cần.
- Có thể có bảng lịch sử thay đổi trạng thái nếu cần kiểm toán.

## 10.5. Cấu hình

- Bảng cấu hình giờ làm việc và quy tắc đặt lịch.
- Bảng cấu hình nghiệp vụ phù hợp.

Không nhất thiết tạo một bảng riêng cho mọi trạng thái hoặc mọi loại dữ liệu.

Trước khi triển khai, hãy xác định schema hợp lý, quan hệ giữa các bảng và quy tắc xóa dữ liệu.

Các nguyên tắc bắt buộc:

- Có khóa chính.
- Có khóa ngoại.
- Có index cho các truy vấn thường xuyên.
- Có timestamp tạo và cập nhật phù hợp.
- Có cơ chế lưu trạng thái rõ ràng.
- Không lưu lịch sử hội thoại chỉ trong bộ nhớ.
- Không xóa lịch sử chat khi kết thúc tư vấn.
- Không xóa cứng lịch hẹn đã phát sinh nếu việc đó làm mất lịch sử nghiệp vụ.
- Có migration và seed dữ liệu.
- Dùng kiểu dữ liệu thời gian phù hợp, thống nhất quy ước múi giờ.
- Chống đặt trùng bằng cơ chế phù hợp với PostgreSQL, chẳng hạn transaction, khóa hoặc ràng buộc loại trừ khi phù hợp.
- Kiểm tra tính đúng đắn của các ràng buộc trước khi coi chức năng đặt lịch là hoàn thành.

Nếu schema cần điều chỉnh trong quá trình phát triển, tạo migration thay vì sửa dữ liệu thủ công không có kiểm soát.

---

# 11. XÁC THỰC, PHÂN QUYỀN VÀ BẢO MẬT

Triển khai bảo mật thực tế cho ứng dụng.

Các yêu cầu:

- Hash mật khẩu bằng thuật toán phù hợp.
- Quản lý session hoặc token an toàn.
- Bảo vệ API quản trị.
- Phân biệt quyền Admin và nhân viên.
- Kiểm tra quyền trên backend ở mọi thao tác nhạy cảm.
- Validation dữ liệu đầu vào.
- Chống SQL injection.
- Bảo vệ khỏi XSS bằng cách xử lý nội dung hiển thị an toàn.
- Cấu hình CORS phù hợp.
- Rate limiting cho các endpoint nhạy cảm.
- Không để lộ stack trace hoặc bí mật trong phản hồi production.
- Không để lộ API key cho frontend.
- Không để AI truy cập SQL tùy ý.
- Kiểm tra quyền tham gia phòng Socket.IO.
- Chống gửi tin nhắn giả mạo người khác.
- Chống tạo lịch hoặc hủy lịch trái phép.
- Bảo vệ thông tin cá nhân.
- Không dùng dữ liệu khách hàng thật trong seed.
- Không ghi mật khẩu hoặc API key vào log.
- Có cơ chế khởi tạo tài khoản Admin an toàn.

Đối với khách vãng lai, thiết kế cơ chế xác minh quyền truy cập cuộc hội thoại và lịch hẹn. Có thể dùng session khách hàng được cấp ngẫu nhiên, cookie phù hợp hoặc giải pháp khác có bảo vệ quyền sở hữu.

Không dùng ID tăng dần hoặc mã lịch hẹn đơn thuần làm bằng chứng xác thực.

---

# 12. QUẢN LÝ TRẠNG THÁI VÀ TÍNH NHẤT QUÁN

Tách biệt trạng thái của các thực thể.

Ví dụ:

Trạng thái cuộc hội thoại:
- `ai`.
- `waiting_for_agent`.
- `human`.
- `closed`.

Trạng thái lịch hẹn:
- `pending`.
- `confirmed`.
- `cancelled`.
- `completed`.

Có thể điều chỉnh trạng thái lịch theo quy trình thực tế, nhưng phải phân biệt giữa lịch khách vừa tạo, lịch đã được xác nhận theo chính sách và lịch đã hoàn thành.

Không mặc định một cuộc hội thoại kết thúc đồng nghĩa lịch hẹn bị hủy.

Không mặc định nhân viên tiếp nhận chat đồng nghĩa nhân viên đã xác nhận lịch hẹn.

Không để AI tự cập nhật trạng thái mà không qua backend.

Các chuyển trạng thái quan trọng phải có kiểm tra điều kiện hợp lệ.

---

# 13. THỜI GIAN THỰC VÀ KHẢ NĂNG PHỤC HỒI

Sử dụng Socket.IO cho:

- Tin nhắn chat.
- Thông báo cuộc hội thoại mới.
- Thông báo nhân viên tiếp nhận.
- Cập nhật trạng thái chat.
- Cập nhật tin nhắn giữa khách và nhân viên.

REST API vẫn là nguồn xử lý nghiệp vụ chính đối với các thao tác cần xác thực và lưu dữ liệu.

Không chỉ dựa vào sự kiện Socket.IO để xác định rằng tin nhắn đã được lưu thành công.

Khi mất kết nối:

- Hiển thị trạng thái kết nối.
- Cho phép kết nối lại.
- Tải các tin nhắn bị bỏ lỡ từ database.
- Chống lưu tin nhắn trùng khi gửi lại.
- Không mất cuộc hội thoại do làm mới trang.
- Kiểm tra lại quyền truy cập sau khi kết nối lại.

Không cần triển khai hệ thống microservices hoặc message broker riêng cho phiên bản đầu nếu chưa cần thiết.

---

# 14. THIẾT KẾ GIAO DIỆN

Thiết kế giao diện hiện đại, gọn gàng và dễ sử dụng.

Yêu cầu:

- Bố cục rõ ràng.
- Typography dễ đọc.
- Khoảng cách hợp lý.
- Màu sắc thống nhất.
- Responsive.
- Form có validation.
- Có trạng thái loading.
- Có trạng thái lỗi.
- Có thông báo thành công.
- Có empty state khi không có dữ liệu.
- Có xác nhận trước thao tác quan trọng.
- Không để nút bấm vô tác dụng.
- Không để dữ liệu giả xuất hiện trong luồng hoạt động thật.
- Không hardcode dữ liệu nghiệp vụ trong frontend.
- Tách file CSS, JavaScript và HTML hợp lý.

Ưu tiên giao diện thực dụng, dễ bảo trì hơn hiệu ứng phức tạp.

Các trang quản trị cần có điều hướng rõ ràng giữa Dashboard, Mặt hàng, Lịch hẹn, Chat và Nhân viên.

---

# 15. API BACKEND

Thiết kế REST API theo nhóm chức năng.

Các nhóm dự kiến:

## Authentication
- Đăng nhập.
- Đăng xuất.
- Lấy thông tin tài khoản hiện tại.

## Products
- Danh sách mặt hàng.
- Chi tiết mặt hàng.
- Tìm kiếm và lọc.
- Tạo, sửa, ẩn hoặc cập nhật mặt hàng dành cho Admin.

## Conversations
- Tạo hoặc tiếp tục cuộc hội thoại.
- Lấy lịch sử tin nhắn.
- Gửi tin nhắn đến AI.
- Chuyển sang nhân viên.
- Quay lại AI.
- Kết thúc cuộc hội thoại.

## Agent Chat
- Danh sách cuộc hội thoại đang chờ.
- Tiếp nhận cuộc hội thoại.
- Gửi tin nhắn.
- Kết thúc tư vấn.
- Chuyển nhân viên phụ trách nếu được cấp quyền.

## Appointments
- Kiểm tra giờ trống.
- Tạo lịch hẹn.
- Tra cứu lịch hẹn.
- Đổi lịch.
- Hủy lịch.
- Quản lý lịch hẹn dành cho Admin.

## Settings
- Lấy cấu hình công khai cần thiết.
- Quản lý giờ làm việc và quy tắc đặt lịch dành cho Admin.

Đây là các nhóm API định hướng. Hãy quyết định đường dẫn, HTTP methods và schema cụ thể trong quá trình thiết kế.

Mỗi endpoint cần có:

- Validation.
- Xác thực và phân quyền khi cần.
- Cấu trúc response nhất quán.
- Xử lý lỗi.
- Mã trạng thái HTTP phù hợp.
- Kiểm thử cho các luồng chính.

Không để frontend gọi trực tiếp các hàm nội bộ của AI hoặc database.

---

# 16. LOGGING VÀ XỬ LÝ LỖI

Triển khai logging có cấu trúc.

Cần ghi nhận đủ để chẩn đoán:

- Lỗi database.
- Lỗi AI provider.
- Timeout.
- Lỗi gửi tin nhắn.
- Lỗi tạo lịch.
- Lỗi xác thực.
- Lỗi kết nối Socket.IO.
- Lỗi khởi tạo ứng dụng.

Không ghi nội dung nhạy cảm không cần thiết.

Các lỗi trả về cho khách hàng phải dễ hiểu. Thông tin kỹ thuật chi tiết chỉ ghi trong log phía server.

Khi AI provider không phản hồi, hệ thống phải xử lý timeout và thông báo phù hợp, không treo vô thời hạn.

Khi database tạm thời không khả dụng, backend không được giả vờ rằng dữ liệu đã lưu thành công.

---

# 17. KIỂM THỬ BẮT BUỘC

Tạo các bài kiểm thử phù hợp, ưu tiên kiểm thử service nghiệp vụ, API và các luồng tích hợp quan trọng.

## 17.1. Mặt hàng

- Danh sách có dữ liệu.
- Danh sách rỗng.
- Chi tiết mặt hàng hợp lệ.
- Mặt hàng không tồn tại.
- Tìm kiếm và lọc.
- Người chưa đăng nhập không thể thao tác quản trị.

## 17.2. Đặt lịch qua AI

- Khách yêu cầu đặt lịch bằng ngôn ngữ tự nhiên.
- Khách cung cấp đủ thông tin ngay từ đầu.
- Khách cung cấp thông tin từng bước.
- Khách yêu cầu một khung giờ còn trống.
- Khách yêu cầu khung giờ ngoài giờ làm việc.
- Khách yêu cầu khung giờ đã được đặt.
- Khách đổi ngày hoặc giờ trước khi xác nhận.
- Khách chưa xác nhận nhưng AI vẫn cố tạo lịch.
- AI provider bị lỗi.
- Database lỗi khi tạo lịch.
- Hai khách cùng yêu cầu một khung giờ.
- Khách gửi nhiều yêu cầu tạo lịch giống nhau.
- Khách tra cứu lịch không thuộc quyền sở hữu.

## 17.3. Chat AI sang nhân viên

- Khách đang chat với AI và nhấn switch.
- Có nhân viên sẵn sàng.
- Không có nhân viên sẵn sàng.
- Cuộc hội thoại được đưa vào hàng đợi.
- Nhân viên tiếp nhận cuộc hội thoại.
- Hai nhân viên bấm tiếp nhận đồng thời.
- Khách và nhân viên gửi tin nhắn qua lại.
- Tin nhắn được lưu trong database.
- Khách tải lại trang.
- Nhân viên tải lại trang.
- Socket.IO mất kết nối rồi kết nối lại.
- Khách quay lại AI.
- Nhân viên kết thúc tư vấn.
- Nhân viên không được truy cập cuộc hội thoại ngoài quyền hạn.
- Khách không được truy cập cuộc hội thoại của khách khác.
- Lịch sử AI được bảo toàn sau khi switch.
- AI không trả lời xen vào khi nhân viên đang xử lý.

## 17.4. Docker

- Build image thành công.
- PostgreSQL khởi động.
- Backend kết nối database.
- Migration chạy thành công.
- Seed dữ liệu chạy thành công.
- Website truy cập được từ trình duyệt.
- Dữ liệu còn nguyên sau khi restart container.
- Các lệnh trong README hoạt động đúng.
- Kiểm tra log khi cấu hình AI sai.
- Kiểm tra khả năng khởi động khi AI chưa được cấu hình.

Không chỉ kiểm thử bằng cách đọc code. Hãy chạy các bài kiểm thử có thể thực hiện trong môi trường hiện tại.

---

# 18. CẤU TRÚC DỰ ÁN

Tự quyết định cấu trúc thư mục phù hợp, nhưng phải rõ ràng và dễ bảo trì.

Có thể tổ chức theo hướng:

- `src/config`: cấu hình.
- `src/routes`: định nghĩa API.
- `src/controllers`: tiếp nhận yêu cầu.
- `src/services`: nghiệp vụ.
- `src/repositories`: truy cập database.
- `src/middleware`: xác thực và xử lý yêu cầu.
- `src/validators`: kiểm tra dữ liệu.
- `src/ai`: AI provider, orchestration và tools.
- `src/chat`: xử lý chat và Socket.IO.
- `src/appointments`: nghiệp vụ đặt lịch.
- `src/products`: nghiệp vụ mặt hàng.
- `src/admin`: nghiệp vụ quản trị.
- `public`: HTML, CSS, JavaScript và tài nguyên frontend.
- `prisma` hoặc thư mục migration tương ứng.
- `tests`: kiểm thử.
- `scripts`: các lệnh khởi tạo cần thiết.

Đây là gợi ý. Có thể điều chỉnh cấu trúc nhưng không được tạo kiến trúc quá phức tạp so với quy mô ứng dụng.

---

# 19. DỮ LIỆU MẪU VÀ KHỞI TẠO

Cung cấp seed dữ liệu phục vụ kiểm thử:

- Một số danh mục.
- Một số mặt hàng mẫu.
- Cấu hình giờ làm việc.
- Dữ liệu lịch hẹn mẫu nếu cần.
- Các tài khoản nhân viên chỉ khi có cơ chế khởi tạo an toàn.

Không sử dụng dữ liệu cá nhân thật.

Không hardcode thông tin đăng nhập Admin trong mã nguồn.

Có hướng dẫn khởi tạo Admin bằng biến môi trường hoặc lệnh CLI an toàn.

Seed phải có khả năng chạy lặp lại mà không gây trùng dữ liệu không mong muốn.

---

# 20. TÀI LIỆU VÀ HƯỚNG DẪN SỬ DỤNG

Tạo README.md bằng tiếng Việt, bao gồm:

1. Mô tả dự án.
2. Công nghệ sử dụng.
3. Kiến trúc tổng thể.
4. Cấu trúc thư mục.
5. Yêu cầu môi trường.
6. Cách cấu hình `.env`.
7. Cách khởi chạy Docker.
8. Cách chạy migration.
9. Cách seed dữ liệu.
10. Cách tạo tài khoản Admin ban đầu.
11. Cách truy cập website.
12. Cách truy cập trang quản trị.
13. Cách cấu hình AI provider.
14. Cách kết nối mô hình AI chạy trên máy host.
15. Cách kiểm tra chức năng chat AI.
16. Cách kiểm tra chức năng switch sang nhân viên.
17. Cách kiểm tra đặt lịch.
18. Cách chạy test.
19. Cách xem log.
20. Cách sao lưu và phục hồi database.
21. Cách dừng và khởi động lại ứng dụng.
22. Các giới hạn còn tồn tại.

Các lệnh phải phù hợp với cấu trúc dự án thực tế, không ghi lệnh giả định chưa được kiểm tra.

---

# 21. QUY TRÌNH TRIỂN KHAI

Thực hiện theo các giai đoạn sau.

## Giai đoạn 1: Khởi tạo dự án

- Tạo cấu trúc thư mục.
- Khởi tạo package.json.
- Tạo cấu hình Node.js và Express.
- Tạo Dockerfile.
- Tạo docker-compose.yml.
- Tạo cấu hình PostgreSQL.
- Tạo healthcheck.
- Tạo .env.example.
- Tạo README ban đầu.
- Kiểm tra ứng dụng khởi động.

## Giai đoạn 2: Database và backend cơ bản

- Thiết kế schema.
- Tạo migration.
- Tạo seed.
- Xây dựng lớp truy cập database.
- Xây dựng xử lý lỗi.
- Xây dựng validation.
- Xây dựng xác thực và phân quyền.

## Giai đoạn 3: Website khách hàng

- Trang chủ.
- Danh sách mặt hàng.
- Chi tiết mặt hàng.
- Giao diện chat.
- Giao diện hiển thị trạng thái cuộc hội thoại.
- Giao diện đặt lịch trong chat.
- Giao diện tra cứu lịch hẹn.

## Giai đoạn 4: Quản trị

- Đăng nhập Admin.
- Dashboard.
- Quản lý mặt hàng.
- Quản lý lịch hẹn.
- Quản lý tài khoản nhân viên.
- Giao diện chat trực tiếp.
- Danh sách chat chờ tiếp nhận.
- Tiếp nhận và kết thúc cuộc hội thoại.

## Giai đoạn 5: AI Chat và đặt lịch

- Tạo AI provider adapter.
- Xây dựng AI orchestration.
- Đăng ký công cụ nghiệp vụ.
- Kiểm tra giờ trống.
- Thu thập thông tin khách.
- Yêu cầu xác nhận.
- Tạo lịch thật trong database.
- Xử lý lỗi và chống đặt trùng.
- Kiểm thử các trường hợp thành công và thất bại.

## Giai đoạn 6: Switch sang nhân viên

- Chuyển trạng thái cuộc hội thoại.
- Tạo hàng đợi tiếp nhận.
- Gán nhân viên an toàn.
- Thông báo chat mới.
- Gửi và nhận tin nhắn qua Socket.IO.
- Lưu lịch sử tin nhắn.
- Đồng bộ trạng thái khách và nhân viên.
- Bảo toàn lịch sử AI.
- Xử lý mất kết nối.
- Kiểm thử quyền truy cập.

## Giai đoạn 7: Hoàn thiện Docker và kiểm thử

- Build lại image.
- Khởi động toàn bộ hệ thống.
- Chạy migration và seed.
- Chạy test.
- Kiểm tra log.
- Sửa lỗi phát hiện được.
- Kiểm tra dữ liệu bền vững.
- Hoàn thiện README.

Không được bỏ qua giai đoạn kiểm thử chỉ vì ứng dụng đã hiển thị giao diện.

---

# 22. TIÊU CHÍ NGHIỆM THU

Dự án chỉ được coi là hoàn thành khi đáp ứng các tiêu chí sau:

### Frontend
- Website truy cập được.
- Danh sách và chi tiết mặt hàng hoạt động.
- Chat có giao diện và kết nối backend.
- Có nút switch sang nhân viên.
- Có giao diện Admin.
- Có giao diện quản lý chat.
- Có giao diện quản lý lịch hẹn.

### Backend
- API hoạt động.
- Xác thực và phân quyền hoạt động.
- Dữ liệu được lưu vào database.
- API xử lý lỗi đúng.
- Các thao tác nhạy cảm được kiểm tra quyền.

### AI
- Có thể kết nối AI provider được cấu hình.
- AI có thể gọi các công cụ nghiệp vụ được phép.
- AI kiểm tra giờ trống từ backend.
- AI không bịa lịch trống.
- AI yêu cầu xác nhận trước khi tạo lịch.
- AI chỉ thông báo thành công sau khi backend trả kết quả thành công.

### Chat nhân viên
- Khách bấm switch và cuộc hội thoại thực sự chuyển sang hàng đợi nhân viên.
- Nhân viên có thể tiếp nhận cuộc hội thoại.
- Khách và nhân viên nhắn tin theo thời gian thực.
- Tin nhắn được lưu trong database.
- Lịch sử AI được giữ nguyên.
- AI không xen vào cuộc chat của nhân viên.
- Quyền truy cập được kiểm tra.
- Có xử lý trường hợp không có nhân viên.

### Database
- Migration hoạt động.
- Seed hoạt động.
- Ràng buộc dữ liệu phù hợp.
- Không tạo lịch trùng trong trường hợp đồng thời.
- Dữ liệu tồn tại sau khi restart Docker.

### Docker
- Có thể build và khởi động theo README.
- Các service hoạt động đúng.
- Không phụ thuộc vào Node.js hoặc PostgreSQL cài trực tiếp trên máy host.
- Có thể chạy các chức năng không phụ thuộc AI ngay cả khi chưa cấu hình AI provider.

### Kiểm thử
- Các luồng nghiệp vụ chính có test.
- Những lỗi phát hiện được phải được sửa hoặc ghi rõ.
- Không tuyên bố đã kiểm thử thành công nếu chưa chạy.

Nếu AI chưa được cấu hình hoặc không thể kết nối trong môi trường hiện tại, hãy ghi rõ giới hạn đó. Không được dùng phản hồi giả để đánh dấu tích hợp AI thật đã hoàn thành.

---

# 23. NGUYÊN TẮC LÀM VIỆC

1. Xây dựng từ con số 0.
2. Không yêu cầu tôi cung cấp source code cũ.
3. Không chỉ trả lời bằng kế hoạch.
4. Không chỉ cung cấp code mẫu.
5. Không tạo giao diện tĩnh rồi coi như hoàn thành.
6. Không bỏ qua chức năng switch sang chat trực tiếp với nhân viên.
7. Không bỏ qua việc lưu lịch sử chat.
8. Không bỏ qua xác nhận trước khi tạo lịch.
9. Không để AI truy cập database tùy ý.
10. Không để AI tự khẳng định đã đặt lịch thành công khi backend chưa xác nhận.
11. Không hardcode thông tin bí mật.
12. Không tạo kiến trúc phức tạp quá mức cần thiết.
13. Không tự ý sử dụng công nghệ ngoài yêu cầu nếu không có lý do rõ ràng.
14. Không xóa hoặc ghi đè file ngoài phạm vi dự án nếu chưa được phép.
15. Khi gặp lỗi, phải điều tra nguyên nhân, sửa và kiểm tra lại.
16. Khi hoàn thành mỗi giai đoạn, ghi lại kết quả và những vấn đề còn tồn tại.
17. Ưu tiên tính đúng đắn của nghiệp vụ, bảo mật và khả năng vận hành hơn hiệu ứng giao diện.
18. Không dừng sau khi chỉ tạo một vài file ban đầu.
19. Không tuyên bố hoàn thành những chức năng mới chỉ được mô tả nhưng chưa triển khai.
20. Tiếp tục triển khai đến khi đạt mức hoàn thành tối đa có thể trong môi trường được cấp.

## YÊU CẦU BẮT ĐẦU

Hãy bắt đầu xây dựng toàn bộ dự án ngay bây giờ.

Trước tiên, tạo cấu trúc dự án và cấu hình Docker Compose. Sau đó triển khai database, backend, frontend, AI, chat trực tiếp với nhân viên và các chức năng quản trị theo đúng thứ tự.

Sau mỗi giai đoạn, hãy chạy các kiểm tra có thể thực hiện, sửa lỗi và tiếp tục sang giai đoạn tiếp theo.

Khi kết thúc, hãy cung cấp báo cáo gồm:

- Các chức năng đã hoàn thành.
- Các file và module chính đã tạo.
- Kết quả build Docker.
- Kết quả migration và seed.
- Kết quả kiểm thử.
- Cách chạy dự án.
- Cách cấu hình AI.
- Những chức năng chưa hoàn thành và lý do cụ thể.

**Mục tiêu cuối cùng: một dự án website full-stack có mã nguồn thực tế, có database, có AI đặt lịch qua hội thoại, có nút switch sang chat trực tiếp với nhân viên Admin và có thể chạy trên Docker.**