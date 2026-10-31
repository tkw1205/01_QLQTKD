# ĐẶC TẢ NGHIỆP VỤ (BUSINESS SPECIFICATION)

## Website đặt lịch dịch vụ

-   **Loại tài liệu:** Đặc tả nghiệp vụ
-   **Phiên bản:** 1.0
-   **Ngôn ngữ:** Tiếng Việt
-   **Phạm vi:** Mô tả nghiệp vụ và quy tắc hệ thống; chưa bao gồm thiết
    kế kỹ thuật hoặc triển khai code.

------------------------------------------------------------------------

## 1. Mục đích và phạm vi

Tài liệu mô tả các nghiệp vụ của website đặt lịch dịch vụ để Product
Owner, BA, Developer và Tester cùng hiểu và thống nhất cách hệ thống
phải hoạt động.

Dự án và giao diện đã tồn tại. Việc triển khai sau này phải tích hợp vào
dự án hiện có, giữ nguyên giao diện và kiến trúc đang dùng nếu không có
lý do nghiệp vụ rõ ràng để thay đổi. Tài liệu này **không yêu cầu
implement**, không quy định lại công nghệ, cấu trúc code hay thiết kế
UI.

### 1.1. Phạm vi chức năng

-   Hiển thị và quản lý dịch vụ, danh mục dịch vụ.
-   Đặt lịch trực tuyến và tạo lịch trực tiếp tại cửa hàng.
-   Quản lý khung giờ, sức chứa, giờ hoạt động và ngày nghỉ.
-   Quản lý, đổi, hủy và theo dõi trạng thái lịch hẹn.
-   Phân công nhân viên.
-   Tra cứu lịch hẹn.
-   Chat giữa khách hàng và nhân viên.
-   Quản lý tài khoản và phân quyền.
-   Thông báo nội bộ.
-   Thống kê cơ bản.
-   Quản lý thông tin cửa hàng.
-   Lưu ghi chú và lịch sử thay đổi.

### 1.2. Ngoài phạm vi

-   Thiết kế lại giao diện hoặc xây dựng lại website từ đầu.
-   Tài khoản đăng nhập dành cho khách hàng.
-   Thanh toán trực tuyến hoặc đặt cọc.
-   Gửi email tự động.
-   Giảm giá, mã khuyến mãi hoặc giá riêng cho từng lịch hẹn.
-   Xuất báo cáo Excel/CSV.
-   Trang nhật ký toàn hệ thống riêng biệt.
-   Chức năng quản lý sao lưu trên giao diện.
-   Tự động đăng xuất khi người dùng không hoạt động.
-   Lưu hồ sơ khách hàng độc lập ngoài thông tin gắn với lịch hẹn và dữ
    liệu chat cần thiết.

## 2. Vai trò người dùng và quyền hạn

### 2.1. Khách hàng

Khách không cần đăng ký hoặc đăng nhập. Khách có thể: - Xem dịch vụ,
danh mục, giá và thời lượng. - Đặt lịch trước tối đa 7 ngày. - Nhập họ
tên, số điện thoại, email và ghi chú. - Nhận mã đặt lịch sau khi đặt
thành công. - Tra cứu lịch bằng mã đặt lịch kết hợp số điện thoại hoặc
email đã dùng khi đặt. - Mở chat, gửi tin nhắn và tiếp tục cuộc trò
chuyện cũ bằng mã chat.

Khách không có chức năng tự hủy hoặc tự đổi lịch. Khách phải liên hệ
nhân viên để yêu cầu hủy hoặc đổi lịch. Khi tra cứu, khách chỉ xem được
thông tin lịch hẹn.

### 2.2. Lễ tân

Lễ tân có tài khoản riêng và có thể: - Xem, tìm kiếm, lọc và quản lý
lịch hẹn. - Tạo lịch trực tiếp cho khách tại cửa hàng. - Thay đổi dịch
vụ trong lịch hẹn theo các quy tắc ở mục 6. - Gán hoặc thay đổi nhân
viên phụ trách. - Cập nhật trạng thái lịch hẹn. - Hủy lịch hẹn. - Xem và
phản hồi tất cả cuộc trò chuyện. - Thêm ghi chú nội bộ.

Lễ tân không được tự ý thay đổi giá dịch vụ hoặc đặt giá riêng cho lịch
hẹn.

### 2.3. Admin

Admin có tài khoản riêng và quyền quản lý toàn hệ thống, bao gồm: - Dịch
vụ và danh mục. - Sức chứa, giờ hoạt động, ngày nghỉ và slot bị đóng. -
Lịch hẹn. - Danh sách nhân viên. - Tài khoản admin và lễ tân. - Thông
tin cửa hàng. - Thống kê. - Chat. - Ghi chú nội bộ và lịch sử thay đổi.

Admin có thể tạo, chỉnh sửa và khóa tài khoản nhân viên quản trị.

## 3. Dịch vụ và danh mục

### 3.1. Dữ liệu dịch vụ

Mỗi dịch vụ có: - Tên. - Mô tả. - Giá. - Thời lượng. - Hình ảnh. - Trạng
thái hoạt động/ngừng hoạt động. - Danh mục.

Admin có thể thêm, sửa, bật hoặc tắt dịch vụ. Hình ảnh được tải lên từ
máy tính.

### 3.2. Danh mục

Admin quản lý danh mục và gán dịch vụ vào danh mục. Khách có thể lọc
dịch vụ theo danh mục.

Không cho xóa dịch vụ hoặc danh mục nếu còn lịch hẹn liên quan khiến
việc xóa làm mất dữ liệu hoặc lịch sử. Cần xử lý dữ liệu liên quan trước
khi xóa.

### 3.3. Thay đổi dịch vụ

-   Dịch vụ ngừng hoạt động không được dùng để tạo lịch mới.
-   Lịch hẹn hiện có vẫn được giữ nguyên.
-   Giá và thời lượng của lịch hẹn được chốt theo thông tin dịch vụ tại
    thời điểm lịch hẹn được tạo hoặc xác nhận.
-   Khi admin sửa giá hoặc thời lượng dịch vụ, chỉ lịch hẹn mới áp dụng
    giá/thời lượng mới.
-   Không hỗ trợ giảm giá hoặc sửa giá riêng trên từng lịch hẹn.

## 4. Giờ hoạt động, ngày nghỉ và slot

### 4.1. Định nghĩa slot

-   Slot có thời lượng 1 giờ.
-   Giờ bắt đầu được chọn từ danh sách khung giờ cố định do lịch hoạt
    động quy định, ví dụ 08:00, 09:00, 10:00.
-   Mỗi slot của mỗi ngày có sức chứa riêng.

### 4.2. Cấu hình hoạt động

Admin có thể: - Cấu hình giờ mở cửa và đóng cửa. - Thiết lập giờ đặc
biệt cho từng ngày. - Đánh dấu ngày nghỉ. - Đóng toàn bộ một ngày. -
Đóng một slot cụ thể trong một ngày.

Slot hoặc ngày đã đóng không nhận lịch mới. Lịch hẹn đã xác nhận không
tự động bị xóa hoặc hủy chỉ vì slot/ngày bị đóng.

### 4.3. Thay đổi ảnh hưởng lịch đã xác nhận

Nếu thay đổi giờ hoạt động hoặc đánh dấu ngày nghỉ ảnh hưởng lịch đã xác
nhận, hệ thống phải: 1. Cảnh báo admin về các lịch hẹn bị ảnh hưởng. 2.
Yêu cầu admin xử lý các lịch hẹn bị ảnh hưởng trước khi lưu thay đổi. 3.
Không tự ý xóa lịch hoặc làm mất dữ liệu lịch đã xác nhận.

## 5. Sức chứa và quy tắc đặt lịch

### 5.1. Sức chứa slot

Sức chứa được cấu hình độc lập theo từng ngày và từng slot. Admin không
thể giảm sức chứa của slot xuống thấp hơn số lượt đang chiếm chỗ.

Một lịch hẹn đã xác nhận chiếm một lượt ở mỗi slot mà thời gian lịch hẹn
đi qua.

### 5.2. Tính thời lượng

-   Mỗi dịch vụ có thời lượng cố định do admin cấu hình.
-   Một lịch có thể gồm nhiều dịch vụ.
-   Tổng thời lượng lịch bằng tổng thời lượng các dịch vụ.
-   Các dịch vụ trong một lịch được thực hiện liên tục.
-   Hệ thống xác định tất cả slot bị ảnh hưởng dựa trên giờ bắt đầu và
    tổng thời lượng.
-   Lịch phải kết thúc trước hoặc đúng giờ đóng cửa.

Ví dụ: Lịch bắt đầu lúc 09:00, kéo dài 2 giờ thì cần sức chứa ở slot
09:00--10:00 và 10:00--11:00.

### 5.3. Điều kiện đặt lịch

Khách cần cung cấp: - Họ tên. - Số điện thoại. - Email.

Khách có thể nhập ghi chú. Trước khi xác nhận, hệ thống hiển thị từng
dịch vụ, giá, thời lượng và tổng giá dự kiến.

Lịch được xác nhận tự động nếu thông tin hợp lệ, cửa hàng hoạt động và
tất cả slot liên quan còn đủ sức chứa. Sau khi thành công, website hiển
thị thông báo và mã đặt lịch. Không gửi email tự động.

Khách chỉ được đặt lịch trước tối đa 7 ngày.

### 5.4. Trừ và hoàn sức chứa

-   Chỉ lịch hẹn được xác nhận thành công mới chiếm sức chứa.
-   Mỗi lịch hẹn chiếm một lượt ở mỗi slot bị ảnh hưởng.
-   Lịch chưa xác nhận hoặc đã hủy không chiếm sức chứa.
-   Khi hủy thành công, hoàn lại sức chứa của tất cả slot liên quan.
-   Lịch vắng mặt không hoàn sức chứa vì thời gian đã trôi qua.
-   Không được trừ hoặc hoàn sức chứa nhiều lần cho cùng một thao tác.

### 5.5. Đặt lịch đồng thời và gửi lặp

Nếu nhiều khách cùng đặt lượt cuối của slot, chỉ một lịch được xác nhận.
Những yêu cầu còn lại nhận thông báo hết chỗ và được gợi ý giờ khác. Sức
chứa không được vượt giới hạn.

Một thao tác xác nhận bị gửi lặp không được tạo nhiều lịch hẹn trùng.

### 5.6. Gợi ý giờ khác

Giờ được gợi ý phải: - Nằm trong giờ hoạt động. - Không thuộc ngày nghỉ
hoặc slot đã đóng. - Đủ sức chứa ở mọi slot liên quan. - Kết thúc trước
hoặc đúng giờ đóng cửa. - Nằm trong giới hạn đặt trước 7 ngày.

Không gợi ý một giờ chỉ đủ chỗ ở slot đầu nhưng thiếu chỗ ở slot tiếp
theo.

## 6. Quản lý lịch hẹn

### 6.1. Nguồn tạo lịch

Lịch hẹn có thể được tạo bởi khách trên website hoặc bởi lễ tân khi
khách đến trực tiếp. Lịch do lễ tân tạo vẫn phải tuân thủ quy tắc giờ
hoạt động, sức chứa và thời lượng như lịch trực tuyến.

### 6.2. Trạng thái lịch hẹn

Các trạng thái nghiệp vụ: 1. Đã xác nhận. 2. Khách đã đến. 3. Đang phục
vụ. 4. Hoàn thành. 5. Đã hủy. 6. Khách không đến.

Trạng thái phải được cập nhật theo thao tác được phép của nhân viên.
Lịch đã hoàn thành hoặc vắng mặt vẫn phải giữ lịch sử. Không hoàn lại
sức chứa của lịch vắng mặt sau khi thời gian đã trôi qua.

### 6.3. Đổi lịch

Khi nhân viên đổi lịch: 1. Kiểm tra giờ hoạt động và sức chứa của toàn
bộ slot ở thời gian mới. 2. Nếu hợp lệ, chuyển lịch sang thời gian mới,
giải phóng các slot cũ và chiếm các slot mới. 3. Nếu không hợp lệ, giữ
nguyên lịch cũ và đề xuất thời gian mới phù hợp. 4. Không để lịch hẹn
hoặc sức chứa ở trạng thái cập nhật một phần.

### 6.4. Hủy lịch

-   Khách liên hệ nhân viên để yêu cầu hủy.
-   Khách có thể yêu cầu hủy trước thời điểm bắt đầu lịch.
-   Admin và lễ tân được hủy lịch.
-   Hủy thành công phải cập nhật trạng thái và hoàn sức chứa của tất cả
    slot liên quan.
-   Lưu thời gian hủy và tài khoản thực hiện nếu thao tác do nhân viên
    thực hiện.

### 6.5. Chỉnh sửa dịch vụ trong lịch

Admin hoặc lễ tân có thể thêm hoặc xóa dịch vụ khỏi lịch. Sau khi thay
đổi: - Tính lại tổng giá dựa trên giá dịch vụ được áp dụng cho lịch. -
Tính lại tổng thời lượng. - Kiểm tra giờ đóng cửa và sức chứa cho tất cả
slot liên quan. - Nếu không hợp lệ, giữ nguyên lịch cũ và đề xuất giờ
bắt đầu phù hợp với danh sách dịch vụ mới. - Không cho phép lưu một phần
thay đổi khiến dữ liệu lịch và sức chứa không nhất quán.

### 6.6. Tra cứu và lọc

Nhân viên tìm lịch theo mã đặt lịch, tên khách hoặc số điện thoại. Có
thể lọc theo ngày/khoảng ngày, trạng thái, dịch vụ và nhân viên phụ
trách.

Khách tra cứu bằng mã đặt lịch kết hợp số điện thoại hoặc email đã sử
dụng khi đặt.

## 7. Phân công nhân viên

-   Khách không chọn nhân viên.
-   Mỗi lịch hẹn có đúng một nhân viên phụ trách.
-   Lễ tân phân công hoặc thay đổi nhân viên.
-   Admin quản lý danh sách nhân viên, gồm tên và thông tin liên hệ cơ
    bản.
-   Nhân viên bị vô hiệu hóa không được phân công cho lịch mới.
-   Lịch cũ vẫn giữ tên nhân viên đã được phân công để bảo toàn lịch sử.
-   Lễ tân có thể đổi người phụ trách lịch cũ khi cần.

## 8. Thanh toán

Khách thanh toán tại cửa hàng. Không yêu cầu đặt cọc hoặc thanh toán
trực tuyến. Không có chức năng giảm giá. Trước khi xác nhận đặt lịch,
hiển thị giá từng dịch vụ và tổng giá dự kiến.

## 9. Chat khách hàng -- nhân viên

-   Khách có thể chat mà không cần đăng nhập.
-   Khách có thể gửi tin nhắn bất cứ lúc nào.
-   Mỗi cuộc trò chuyện có mã chat riêng.
-   Khách có thể dùng mã chat để tiếp tục cuộc trò chuyện cũ.
-   Admin và tất cả lễ tân có thể xem và trả lời mọi cuộc trò chuyện.
-   Tin nhắn được lưu để nhân viên trả lời sau nếu không có người trực.
-   Giao diện chat được mở/chuyển đến khi khách bấm nút chat hiện có.
-   Có thông báo trên trang quản trị khi có tin nhắn mới.
-   Lưu nội dung và thời gian tin nhắn.

## 10. Thông báo nội bộ

Trên website quản trị, thông báo cho admin và lễ tân khi: - Có lịch
mới. - Lịch bị hủy. - Lịch được đổi thời gian. - Có tin nhắn chat mới.

Thông báo cần dẫn đến nội dung liên quan để nhân viên xử lý. Không gửi
email tự động.

## 11. Ghi chú và lịch sử thay đổi

### 11.1. Ghi chú

Khách có thể ghi chú khi đặt lịch. Admin và lễ tân có thể thêm ghi chú
nội bộ. Ghi chú nội bộ phải được phân biệt với ghi chú khách hàng và
không được hiển thị nhầm cho khách.

### 11.2. Lịch sử lịch hẹn

Trong chi tiết lịch hẹn, admin và lễ tân xem được lịch sử thay đổi theo
thời gian, bao gồm nội dung thay đổi và tài khoản thực hiện. Không yêu
cầu trang nhật ký toàn hệ thống riêng.

### 11.3. Dữ liệu khách hàng

Không xây dựng hồ sơ khách hàng độc lập. Thông tin khách được lưu gắn
với lịch hẹn; dữ liệu chat được lưu để phục vụ cuộc trò chuyện.

## 12. Tài khoản và bảo mật quyền

-   Admin và lễ tân có tài khoản riêng.
-   Admin tạo, chỉnh sửa và khóa tài khoản.
-   Tài khoản bị khóa không được tiếp tục sử dụng chức năng yêu cầu đăng
    nhập.
-   Phân quyền phải được kiểm tra khi thực hiện nghiệp vụ, không chỉ ẩn
    nút trên giao diện.
-   Các thao tác quản trị phải xác định được tài khoản thực hiện.

## 13. Thống kê

Cung cấp thống kê cơ bản: - Tổng số lịch hẹn. - Số lịch theo từng trạng
thái. - Lọc theo ngày hoặc khoảng thời gian.

Báo cáo chỉ để xem và lọc trên website, không cần xuất Excel/CSV.

## 14. Thông tin cửa hàng và trang chủ

Admin quản lý tên cửa hàng, địa chỉ, số điện thoại, giờ hoạt động và
thông tin liên hệ. Các thông tin này hiển thị trên website tại vị trí
phù hợp với giao diện hiện tại.

Trang chủ tập trung vào danh sách dịch vụ, giá, thời lượng và chức năng
đặt lịch. Không yêu cầu bổ sung một khu vực giới thiệu riêng.

## 15. Ngôn ngữ

Website và trang quản trị sử dụng tiếng Việt. Các nhãn, trạng thái,
thông báo và nội dung nghiệp vụ cũng dùng tiếng Việt.

## 16. Quy tắc dữ liệu và tính nhất quán

Các quy tắc sau phải được bảo đảm ở cấp nghiệp vụ: - Không xác nhận lịch
vượt sức chứa. - Một lịch chỉ trừ sức chứa một lần trên mỗi slot liên
quan. - Hủy lịch chỉ hoàn sức chứa một lần. - Đổi lịch thất bại không
làm thay đổi lịch cũ. - Giá và thời lượng của lịch cũ không tự đổi khi
dịch vụ được chỉnh sửa. - Dữ liệu lịch hẹn, trạng thái, sức chứa và lịch
sử phải nhất quán. - Không xóa dữ liệu lịch sử cần thiết khi dịch vụ
hoặc nhân viên ngừng hoạt động. - Mọi thao tác phải tuân thủ quyền của
vai trò đang đăng nhập.

## 17. Tiêu chí nghiệm thu nghiệp vụ

  -----------------------------------------------------------------------
  Mã                      Tình huống              Kết quả mong đợi
  ----------------------- ----------------------- -----------------------
  AC-01                   Đặt lịch hợp lệ         Lịch được xác nhận, có
                                                  mã đặt lịch và trừ đúng
                                                  các slot

  AC-02                   Slot bắt đầu hết chỗ    Không xác nhận lịch;
                                                  đưa ra giờ khác hợp lệ

  AC-03                   Nhiều khách đặt lượt    Chỉ một lịch thành
                          cuối đồng thời          công; lịch còn lại nhận
                                                  thông báo hết chỗ

  AC-04                   Gửi lặp yêu cầu xác     Không tạo lịch trùng
                          nhận                    

  AC-05                   Hủy lịch                Trạng thái đổi thành
                                                  hủy và hoàn đúng sức
                                                  chứa

  AC-06                   Đổi lịch hợp lệ         Lịch đổi giờ và sức
                                                  chứa được chuyển chính
                                                  xác

  AC-07                   Đổi lịch không đủ chỗ   Lịch cũ giữ nguyên và
                                                  có gợi ý giờ khác

  AC-08                   Đặt nhiều dịch vụ       Tính đúng tổng giá,
                                                  tổng thời lượng và tất
                                                  cả slot bị ảnh hưởng

  AC-09                   Lịch vượt giờ đóng cửa  Không cho xác nhận

  AC-10                   Dịch vụ ngừng hoạt động Không cho đặt lịch mới
                                                  bằng dịch vụ đó

  AC-11                   Admin sửa giá/thời      Lịch cũ giữ nguyên;
                          lượng dịch vụ           lịch mới áp dụng thông
                                                  tin mới

  AC-12                   Giảm sức chứa slot      Không cho giảm thấp hơn
                                                  số lượt đang chiếm chỗ

  AC-13                   Ngày nghỉ hoặc slot     Không nhận lịch mới
                          đóng                    trong khoảng thời gian
                                                  bị đóng

  AC-14                   Lễ tân tạo lịch trực    Vẫn áp dụng toàn bộ quy
                          tiếp                    tắc đặt lịch

  AC-15                   Người dùng thao tác     Hệ thống từ chối thao
                          ngoài quyền             tác

  AC-16                   Khách tiếp tục chat     Mở đúng cuộc trò chuyện
                          bằng mã chat            cũ

  AC-17                   Tra cứu lịch            Cần đúng mã lịch và số
                                                  điện thoại hoặc email
                                                  tương ứng

  AC-18                   Xem lịch sử lịch hẹn    Hiển thị thay đổi, thời
                                                  gian và người thực hiện

  AC-19                   Tìm kiếm, lọc, thống kê Kết quả phản ánh dữ
                                                  liệu lịch hẹn thực tế

  AC-20                   Thay đổi codebase       Giao diện và chức năng
                                                  hiện có không bị thay
                                                  đổi ngoài phạm vi
  -----------------------------------------------------------------------

## 18. Thuật ngữ

-   **Lịch hẹn:** Một yêu cầu sử dụng một hoặc nhiều dịch vụ tại thời
    gian xác định.
-   **Slot:** Khung thời gian cố định dài 1 giờ.
-   **Sức chứa:** Số lượt lịch hẹn tối đa có thể chiếm một slot.
-   **Slot bị ảnh hưởng:** Các slot nằm trong khoảng thời gian thực hiện
    lịch hẹn.
-   **Lịch cũ:** Lịch hẹn đã được tạo trước khi thông tin dịch vụ thay
    đổi.
-   **Ghi chú nội bộ:** Nội dung do admin/lễ tân ghi, chỉ phục vụ nhân
    viên quản lý.
-   **Mã đặt lịch:** Mã dùng để tra cứu một lịch hẹn.
-   **Mã chat:** Mã dùng để tiếp tục một cuộc trò chuyện.

------------------------------------------------------------------------

**Lưu ý:** Đây là đặc tả nghiệp vụ, không phải tài liệu thiết kế kỹ
thuật. Developer cần dùng tài liệu này để hiểu hành vi mong muốn của hệ
thống trước khi thiết kế hoặc triển khai giải pháp kỹ thuật.
