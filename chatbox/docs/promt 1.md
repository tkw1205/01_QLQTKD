# PROMPT: HOÀN THIỆN NGHIỆP VỤ WEBSITE ĐẶT LỊCH DỊCH VỤ

## 1. Mục tiêu

Hãy kiểm tra và hoàn thiện toàn bộ nghiệp vụ cho website đặt lịch dịch vụ hiện có.

**Yêu cầu quan trọng:**
- Dự án và giao diện hiện tại đã có sẵn. Hãy làm việc trực tiếp trên codebase hiện tại.
- Tập trung vào nghiệp vụ, xử lý dữ liệu, quy tắc đặt lịch, quản lý lịch hẹn, phân quyền và tích hợp frontend với backend.
- Giữ nguyên giao diện, bố cục, phong cách thiết kế và trải nghiệm người dùng hiện có.
- Không tự ý thiết kế lại website, viết lại toàn bộ dự án hoặc thay đổi công nghệ đang sử dụng.
- Không tạo thêm giao diện mới nếu giao diện hiện tại đã có vị trí phù hợp để tích hợp chức năng.
- Trước khi chỉnh sửa, hãy kiểm tra cấu trúc dự án, công nghệ, database, API, các màn hình và chức năng hiện có.
- Tận dụng lại code, component, API và cấu trúc dữ liệu hiện tại khi phù hợp.
- Chỉ bổ sung hoặc điều chỉnh những thành phần cần thiết để nghiệp vụ hoạt động chính xác.
- Không tự ý thêm những chức năng ngoài phạm vi yêu cầu.
- Không hỏi lại những nội dung đã được quy định rõ trong tài liệu này. Nếu có chi tiết kỹ thuật chưa được xác định, hãy lựa chọn phương án phù hợp với kiến trúc hiện tại và bảo đảm không làm thay đổi nghiệp vụ đã thống nhất.

Mục tiêu cuối cùng là website hoạt động thực tế, dữ liệu nhất quán giữa giao diện, backend và database; không chỉ là giao diện mô phỏng với dữ liệu giả.

## 2. Đối tượng sử dụng và phân quyền

Hệ thống có ba nhóm người sử dụng:

### 2.1. Khách hàng
- Không cần đăng ký tài khoản hoặc đăng nhập.
- Xem danh sách dịch vụ, giá và thời lượng.
- Đặt lịch trực tuyến.
- Tra cứu thông tin lịch hẹn bằng mã đặt lịch và số điện thoại hoặc email đã sử dụng khi đặt lịch.
- Gửi và nhận tin nhắn với admin hoặc lễ tân thông qua chức năng chat.
- Tiếp tục cuộc trò chuyện cũ bằng mã chat.
- Khách chỉ được tra cứu thông tin lịch hẹn; nếu muốn hủy hoặc đổi lịch, khách phải liên hệ nhân viên.

### 2.2. Lễ tân
- Có tài khoản đăng nhập riêng.
- Xem, tìm kiếm, lọc và quản lý lịch hẹn.
- Tạo lịch hẹn trực tiếp cho khách đến cửa hàng.
- Thay đổi dịch vụ trong lịch hẹn theo quy định.
- Phân công hoặc thay đổi nhân viên phục vụ.
- Thay đổi trạng thái lịch hẹn.
- Quản lý và phản hồi tất cả cuộc trò chuyện của khách hàng.
- Không được tự ý chỉnh sửa giá dịch vụ hoặc giá của lịch hẹn.

### 2.3. Admin
- Có tài khoản đăng nhập riêng.
- Quản lý cấu hình hệ thống, dịch vụ, danh mục, nhân viên, tài khoản, giờ hoạt động và sức chứa lịch hẹn.
- Quản lý toàn bộ lịch hẹn và cuộc trò chuyện.
- Xem thống kê và lịch sử thay đổi.
- Tạo, chỉnh sửa hoặc khóa tài khoản admin và lễ tân.
- Theo dõi hoạt động của người dùng có quyền quản trị.

Mỗi thao tác quản trị phải xác định được tài khoản thực hiện.

## 3. Quản lý dịch vụ và danh mục

### 3.1. Thông tin dịch vụ

Mỗi dịch vụ có các trường:
- Tên dịch vụ.
- Mô tả.
- Giá cố định.
- Thời lượng thực hiện.
- Hình ảnh.
- Trạng thái hoạt động hoặc ngừng hoạt động.
- Danh mục dịch vụ.

Admin có thể thêm, chỉnh sửa và bật/tắt trạng thái dịch vụ. Hình ảnh được tải lên từ máy tính.

### 3.2. Danh mục
- Admin quản lý danh mục dịch vụ.
- Admin có thể gán dịch vụ vào danh mục.
- Khách hàng lọc danh sách dịch vụ theo danh mục.
- Không cho phép xóa dịch vụ hoặc danh mục đang có lịch hẹn liên quan nếu việc xóa làm mất tính toàn vẹn dữ liệu. Yêu cầu xử lý các dữ liệu liên quan trước khi xóa.

### 3.3. Thay đổi dịch vụ
- Dịch vụ ngừng hoạt động không được sử dụng để tạo lịch hẹn mới.
- Các lịch hẹn đã tồn tại vẫn được giữ nguyên thông tin.
- Khi admin thay đổi giá hoặc thời lượng dịch vụ, chỉ các lịch hẹn mới áp dụng thông tin mới.
- Lịch hẹn đã đặt phải giữ giá và thời lượng tại thời điểm đặt, kể cả khi dịch vụ được chỉnh sửa sau đó.
- Không cho phép admin hoặc lễ tân tùy ý thay đổi giá riêng cho từng lịch hẹn.

## 4. Quy tắc giờ hoạt động và khung giờ

### 4.1. Khung giờ cố định
- Hệ thống sử dụng các khung giờ bắt đầu cố định, ví dụ 08:00, 09:00, 10:00.
- Mỗi slot có thời lượng 1 giờ.
- Khách hàng chọn giờ bắt đầu trong các khung giờ được phép đặt.
- Giờ mở cửa, giờ đóng cửa và các khung giờ có thể đặt phải được xác định từ cấu hình hoạt động của cửa hàng.

### 4.2. Giờ hoạt động đặc biệt
Admin có thể:
- Thiết lập ngày nghỉ.
- Thiết lập giờ mở cửa và đóng cửa riêng cho từng ngày.
- Đóng toàn bộ một ngày.
- Đóng một slot cụ thể vào một ngày cụ thể.

Khi một ngày hoặc slot bị đóng:
- Không nhận thêm lịch hẹn mới trong khoảng thời gian bị đóng.
- Không tự động xóa hoặc hủy lịch hẹn đã xác nhận trước đó.
- Nếu thay đổi giờ hoạt động hoặc thiết lập ngày nghỉ ảnh hưởng đến lịch đã xác nhận, hệ thống phải cảnh báo và yêu cầu admin xử lý các lịch hẹn bị ảnh hưởng trước khi lưu thay đổi.

## 5. Nghiệp vụ sức chứa và đặt lịch

### 5.1. Sức chứa
- Admin thiết lập sức chứa riêng cho từng slot của từng ngày.
- Sức chứa thể hiện số lịch hẹn có thể tiếp nhận trong slot.
- Sức chứa của từng slot có thể khác nhau.
- Không cho phép admin giảm sức chứa xuống thấp hơn số lượt đang chiếm chỗ trong slot đó.

### 5.2. Xác định các slot cần sử dụng
- Thời lượng mỗi dịch vụ được admin cấu hình.
- Một lịch hẹn có thể bao gồm nhiều dịch vụ.
- Tổng thời lượng bằng tổng thời lượng của tất cả dịch vụ trong lịch hẹn.
- Các dịch vụ được thực hiện liên tục trong cùng một lịch hẹn.
- Hệ thống phải tính chính xác tất cả slot 1 giờ bị ảnh hưởng bởi thời gian bắt đầu và tổng thời lượng.

Ví dụ: Một lịch hẹn bắt đầu lúc 09:00 và kéo dài 2 giờ thì cần đủ sức chứa cho cả slot 09:00–10:00 và 10:00–11:00.

Lịch hẹn không được kết thúc sau giờ đóng cửa của ngày đó.

### 5.3. Điều kiện đặt lịch
- Khách chỉ được đặt lịch trước tối đa 7 ngày.
- Trước khi xác nhận, hiển thị từng dịch vụ, giá, thời lượng và tổng giá dự kiến.
- Bắt buộc nhập họ tên, số điện thoại và email.
- Khách có thể nhập ghi chú khi đặt lịch.
- Sau khi đặt thành công, hiển thị thông báo và mã đặt lịch trên website.
- Không gửi email tự động.
- Lịch hẹn được xác nhận tự động nếu tất cả điều kiện hợp lệ và còn đủ sức chứa.

### 5.4. Quy tắc trừ sức chứa
- Chỉ lịch hẹn được xác nhận thành công mới chiếm sức chứa.
- Mỗi slot bị ảnh hưởng được trừ đúng một lượt cho mỗi lịch hẹn, bất kể lịch hẹn kéo dài bao nhiêu slot.
- Không trừ sức chứa cho lịch hẹn chưa được xác nhận hoặc đã bị hủy.
- Khi hủy lịch thành công, khôi phục sức chứa của tất cả slot mà lịch hẹn đã chiếm.
- Lịch hẹn vắng mặt không được khôi phục sức chứa vì thời gian đã trôi qua.
- Không được trừ hoặc hoàn sức chứa nhiều lần do thao tác lặp lại.

### 5.5. Đặt lịch đồng thời
Nếu nhiều khách cùng đặt lượt cuối cùng của một slot:
- Chỉ một lịch hẹn được xác nhận thành công.
- Các yêu cầu còn lại phải nhận thông báo slot đã hết chỗ.
- Không để sức chứa bị âm hoặc phát sinh lịch hẹn vượt quá sức chứa.
- Đề xuất những giờ bắt đầu khác còn đủ sức chứa cho toàn bộ thời lượng lịch hẹn.

Một lần khách bấm xác nhận không được tạo nhiều lịch hẹn trùng lặp do gửi yêu cầu nhiều lần.

### 5.6. Đề xuất giờ khác
Khi slot khách chọn không còn đủ sức chứa, hệ thống có thể đề xuất giờ khác.

Giờ đề xuất phải thỏa mãn tất cả điều kiện:
- Nằm trong khung giờ hoạt động.
- Không rơi vào ngày nghỉ hoặc slot đã đóng.
- Có đủ sức chứa ở tất cả các slot bị ảnh hưởng.
- Toàn bộ lịch hẹn kết thúc trước hoặc đúng giờ đóng cửa.
- Nằm trong giới hạn đặt lịch trước 7 ngày.

Không đề xuất giờ chỉ còn đủ sức chứa cho slot bắt đầu nhưng thiếu sức chứa ở các slot tiếp theo.

## 6. Quản lý lịch hẹn

### 6.1. Tạo lịch hẹn
Lịch hẹn có thể được tạo bởi:
- Khách hàng trên website.
- Lễ tân khi tiếp nhận khách trực tiếp tại cửa hàng.

Lịch do lễ tân tạo phải áp dụng cùng quy tắc kiểm tra giờ hoạt động, thời lượng và sức chứa như lịch đặt trực tuyến.

### 6.2. Trạng thái lịch hẹn
Hệ thống hỗ trợ các trạng thái:
- Đã xác nhận.
- Khách đã đến.
- Đang phục vụ.
- Hoàn thành.
- Đã hủy.
- Khách không đến.

Chỉ những lịch hẹn đang được xác nhận và còn hiệu lực mới chiếm sức chứa. Lịch hẹn hoàn thành hoặc vắng mặt phải giữ lịch sử và không được tự động giải phóng sức chứa đã sử dụng trong quá khứ.

### 6.3. Đổi lịch
Khi đổi thời gian:
1. Kiểm tra sức chứa của tất cả slot thuộc thời gian mới.
2. Nếu đủ điều kiện, cập nhật lịch hẹn và chuyển sức chứa từ các slot cũ sang các slot mới.
3. Nếu không đủ điều kiện, giữ nguyên hoàn toàn lịch hẹn cũ và đề xuất giờ khác phù hợp.
4. Không để lịch hẹn ở trạng thái cập nhật dở dang hoặc bị mất sức chứa.

### 6.4. Hủy lịch
- Khách không có nút tự hủy hoặc tự đổi lịch; khách cần liên hệ nhân viên.
- Khách có thể liên hệ nhân viên để yêu cầu hủy bất cứ lúc nào trước thời điểm bắt đầu lịch hẹn.
- Admin và lễ tân có thể hủy lịch hẹn.
- Khi hủy thành công, cập nhật trạng thái và khôi phục sức chứa của tất cả slot liên quan.
- Lưu lại thời gian hủy và tài khoản thực hiện nếu người hủy là nhân viên.

### 6.5. Chỉnh sửa dịch vụ trong lịch hẹn
Admin hoặc lễ tân có thể thêm hoặc xóa dịch vụ khỏi lịch hẹn theo nghiệp vụ được phân quyền.

Sau khi thay đổi:
- Tính lại tổng giá theo giá dịch vụ đã áp dụng cho lịch hẹn.
- Tính lại tổng thời lượng.
- Kiểm tra lại giờ đóng cửa và sức chứa của tất cả slot liên quan.
- Nếu không đủ điều kiện, giữ nguyên lịch hẹn cũ và đề xuất giờ bắt đầu phù hợp với danh sách dịch vụ mới.
- Không cho phép chỉnh sửa một phần rồi để lịch hẹn hoặc sức chứa ở trạng thái không nhất quán.

Không áp dụng giảm giá hoặc giá tùy chỉnh cho lịch hẹn.

### 6.6. Tra cứu và lọc
Nhân viên có thể tìm kiếm lịch hẹn theo:
- Mã đặt lịch.
- Tên khách hàng.
- Số điện thoại.

Có thể lọc theo:
- Ngày hoặc khoảng ngày.
- Trạng thái.
- Dịch vụ.
- Nhân viên được phân công.

Khách hàng tra cứu bằng mã đặt lịch kết hợp số điện thoại hoặc email đã dùng khi đặt lịch.

## 7. Phân công nhân viên

- Khách hàng không lựa chọn nhân viên khi đặt lịch.
- Mỗi lịch hẹn có đúng một nhân viên phụ trách.
- Lễ tân phân công hoặc thay đổi nhân viên trong quá trình quản lý lịch.
- Admin quản lý danh sách nhân viên với thông tin cơ bản như tên và thông tin liên hệ.
- Nhân viên đã nghỉ hoặc bị vô hiệu hóa vẫn phải được giữ lại trong dữ liệu lịch hẹn cũ để bảo toàn lịch sử.
- Nhân viên bị vô hiệu hóa không được phân công cho lịch hẹn mới.
- Lễ tân có thể thay đổi nhân viên phụ trách của lịch hẹn cũ khi cần.

## 8. Thanh toán

- Khách thanh toán trực tiếp tại cửa hàng.
- Không yêu cầu thanh toán trước khi đặt lịch.
- Không tích hợp cổng thanh toán trực tuyến.
- Hiển thị giá từng dịch vụ và tổng giá dự kiến trước khi xác nhận đặt lịch.
- Không áp dụng chức năng giảm giá.

## 9. Chat trực tiếp với nhân viên

Website phải có chức năng chat trực tiếp giữa khách hàng và admin/lễ tân.

Yêu cầu:
- Khách không cần đăng nhập để chat.
- Khách có thể gửi tin nhắn bất cứ lúc nào.
- Tin nhắn được lưu lại để nhân viên phản hồi sau nếu không có người trực.
- Mỗi cuộc trò chuyện có mã chat riêng.
- Khách có thể sử dụng mã chat để tiếp tục cuộc trò chuyện trước đó.
- Admin và tất cả lễ tân được quyền xem, phản hồi và quản lý các cuộc trò chuyện.
- Nhân viên có thể tiếp tục trả lời khi khách đã rời website.
- Khi khách nhấn nút chat, website mở hoặc chuyển sang khu vực chat với nhân viên theo cơ chế phù hợp với giao diện hiện có.
- Có thông báo trên trang quản trị khi phát sinh tin nhắn mới để nhân viên nhận biết và xử lý.
- Lưu nội dung và thời gian tin nhắn.
- Không yêu cầu khách tạo tài khoản.

## 10. Thông báo nội bộ

Trên trang quản trị, thông báo cho admin và lễ tân khi có:
- Lịch hẹn mới.
- Lịch hẹn bị hủy.
- Lịch hẹn được đổi thời gian.
- Tin nhắn chat mới.

Thông báo phải giúp nhân viên nhận biết sự kiện và mở được nội dung liên quan.

Chỉ sử dụng thông báo trên website. Không triển khai email tự động.

## 11. Ghi chú và lịch sử thay đổi

### 11.1. Ghi chú lịch hẹn
- Khách hàng có thể nhập ghi chú khi đặt lịch.
- Admin và lễ tân có thể bổ sung ghi chú nội bộ.
- Phân biệt rõ ghi chú khách hàng với ghi chú nội bộ để tránh hiển thị nhầm thông tin nội bộ cho khách.

### 11.2. Lịch sử
- Lưu lịch sử thay đổi của từng lịch hẹn.
- Lưu nội dung thay đổi, thời điểm và tài khoản thực hiện.
- Khi xem chi tiết lịch hẹn, admin và lễ tân có thể xem lịch sử theo trình tự thời gian.
- Không cần tạo trang nhật ký toàn hệ thống riêng chỉ để đáp ứng yêu cầu này.

### 11.3. Hồ sơ khách hàng
Không xây dựng hệ thống hồ sơ khách hàng độc lập. Chỉ lưu thông tin khách gắn với từng lịch hẹn và dữ liệu chat cần thiết cho hoạt động của hệ thống.

## 12. Quản lý tài khoản

- Admin và lễ tân có tài khoản riêng.
- Admin có thể tạo, chỉnh sửa và khóa tài khoản.
- Tài khoản bị khóa không được phép tiếp tục sử dụng các chức năng yêu cầu đăng nhập.
- Phân quyền đúng giữa admin và lễ tân.
- Lưu tài khoản thực hiện các thao tác quản trị và thay đổi lịch hẹn.
- Không tự ý bổ sung đăng nhập khách hàng hoặc các vai trò không được yêu cầu.

## 13. Thống kê

Cung cấp báo cáo cơ bản trên website:
- Tổng số lịch hẹn.
- Số lịch theo từng trạng thái.
- Lọc theo ngày hoặc khoảng thời gian.

Báo cáo chỉ phục vụ xem và lọc dữ liệu. Không cần xuất Excel hoặc CSV.

## 14. Quản lý thông tin cửa hàng

Admin có thể chỉnh sửa:
- Tên cửa hàng.
- Địa chỉ.
- Số điện thoại.
- Giờ hoạt động.
- Thông tin liên hệ.

Các thông tin này được hiển thị trên website tại những vị trí tương ứng trong giao diện hiện có.

Trang chủ tập trung vào danh sách dịch vụ, giá, thời lượng và chức năng đặt lịch. Không tự ý bổ sung một khu vực giới thiệu cửa hàng riêng.

## 15. Ngôn ngữ

Toàn bộ website, trang quản trị, thông báo, trạng thái và nội dung nghiệp vụ sử dụng tiếng Việt.

Không tự ý bổ sung giao diện đa ngôn ngữ.

## 16. Yêu cầu thực hiện trên codebase

Trước khi triển khai:
1. Đọc cấu trúc dự án hiện có.
2. Xác định frontend, backend, database, cơ chế xác thực, API và các thành phần liên quan.
3. Kiểm tra những chức năng đã tồn tại và những chức năng còn thiếu.
4. Xác định các thay đổi tối thiểu để đáp ứng nghiệp vụ.

Trong quá trình triển khai:
- Tái sử dụng cấu trúc và công nghệ hiện tại.
- Không thay thế toàn bộ dự án chỉ để triển khai một nghiệp vụ.
- Không thay đổi giao diện nếu không thực sự cần thiết.
- Kết nối chức năng giao diện với API và database thật.
- Không để các nút, biểu mẫu hoặc thao tác quan trọng chỉ hoạt động giả lập.
- Kiểm tra quyền truy cập ở backend, không chỉ ẩn chức năng trên giao diện.
- Đảm bảo giá, thời lượng, trạng thái và sức chứa được xử lý nhất quán.
- Không để khách hoặc nhân viên thao tác vượt quá quyền được cấp.
- Nếu dự án đang sử dụng Docker, giữ nguyên và tích hợp vào cấu hình Docker hiện có; chỉ chỉnh sửa cấu hình khi cần để hệ thống hoạt động.
- Không tự ý thay đổi công nghệ, thêm dịch vụ bên ngoài hoặc cài đặt các hệ thống không cần thiết.

## 17. Kiểm tra và tiêu chí hoàn thành

Sau khi triển khai, hãy kiểm tra tối thiểu các tình huống sau:

1. Đặt lịch thành công và sức chứa giảm đúng ở tất cả slot liên quan.
2. Đặt lịch khi slot hết chỗ và nhận được đề xuất giờ khác hợp lệ.
3. Hai khách đồng thời đặt lượt cuối của cùng một slot.
4. Gửi yêu cầu đặt lịch lặp lại nhưng không tạo lịch trùng.
5. Hủy lịch và khôi phục chính xác sức chứa.
6. Đổi lịch thành công và chuyển sức chứa từ slot cũ sang slot mới.
7. Đổi lịch thất bại nhưng lịch cũ vẫn được giữ nguyên.
8. Đặt nhiều dịch vụ có tổng thời lượng kéo dài qua nhiều slot.
9. Ngăn lịch hẹn kết thúc sau giờ đóng cửa.
10. Không cho đặt dịch vụ đã ngừng hoạt động.
11. Giữ nguyên giá và thời lượng của lịch cũ khi admin thay đổi dịch vụ.
12. Không cho giảm sức chứa thấp hơn số lượt đang chiếm chỗ.
13. Không nhận lịch mới trong ngày nghỉ hoặc slot đã đóng.
14. Lễ tân tạo lịch trực tiếp và vẫn phải tuân thủ quy tắc sức chứa.
15. Phân quyền chính xác giữa admin và lễ tân.
16. Chat được lưu, tiếp tục bằng mã chat và có thông báo tin nhắn mới.
17. Tra cứu lịch hẹn bằng đúng mã đặt lịch cùng số điện thoại hoặc email.
18. Lịch sử thay đổi ghi đúng nội dung, thời gian và tài khoản.
19. Báo cáo và chức năng tìm kiếm, lọc trả về dữ liệu thực.
20. Các chức năng đã có trên giao diện vẫn hoạt động bình thường sau khi tích hợp.

Ưu tiên kiểm tra tính đúng đắn của nghiệp vụ đặt lịch, sức chứa, đổi/hủy lịch và phân quyền trước.

## 18. Kết quả bàn giao

Sau khi hoàn thành:
- Tóm tắt các nghiệp vụ đã triển khai.
- Liệt kê những file hoặc thành phần chính đã chỉnh sửa.
- Nêu rõ những nghiệp vụ đã kiểm thử và kết quả.
- Chỉ ra những nội dung chưa hoàn thành hoặc còn phụ thuộc vào cấu hình.
- Hướng dẫn cách chạy và kiểm tra dự án theo cấu hình hiện có.

Không tuyên bố hoàn thành một chức năng nếu chưa thực sự triển khai và kiểm tra.

**Nguyên tắc cuối cùng:** Hoàn thiện nghiệp vụ trên dự án hiện tại, bảo toàn giao diện và kiến trúc hiện có, triển khai đúng các quy tắc đã nêu và không tự ý mở rộng phạm vi.
