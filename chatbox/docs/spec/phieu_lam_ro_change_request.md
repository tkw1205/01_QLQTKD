# PHIẾU LÀM RÕ YÊU CẦU THAY ĐỔI (CLARIFICATION ON CHANGE REQUEST)

- **Dự án:** Hệ thống Salon & Đặt lịch dịch vụ (Mây Hair Studio)
- **Tài liệu đối chiếu:**
  1. `docs\spec\business_spec_booking.md` (Đặc tả nghiệp vụ tổng thể)
  2. `docs\spec\N1.QLQTKD.md` (Đặc tả chức năng giao diện & Chatbot Salon)
  3. `docs\spec\Thay_doi_-_bo_sung.docx` (Phiếu yêu cầu thay đổi mới nhất)
- **Mục đích:** Chỉ ra các điểm xung đột logic, rủi ro kỹ thuật và đưa ra các lựa chọn cụ thể để người phê duyệt / người yêu cầu thay đổi (PO/BA/Client) lựa chọn chốt phương án.

---

## I. TỔNG QUAN ĐÁNH GIÁ

1. **Về việc Bỏ trường Email:** **Hoàn toàn khả thi và nên làm ngay**. Trong luồng đặt lịch tại salon, khách hàng chỉ cần Số điện thoại là đủ nhận diện. Việc này giúp giảm thao tác và tăng tỷ lệ hoàn tất đặt lịch.
2. **Về các bổ sung còn lại (Timeout & Giữ chỗ Chatbot):** **Đang có xung đột và thiếu sót logic**. Cần làm rõ các câu hỏi dưới đây trước khi tiến hành code để tránh lỗi nghiệp vụ.

---

## II. CHI TIẾT VẤN ĐỀ & CÂU HỎI LỰA CHỌN

### VẤN ĐỀ 1: Bỏ hẳn Email hay Chuyển thành Không bắt buộc?

* **Bối cảnh & Vấn đề:**
  - Tiêu đề CR ghi: *"Không bắt buộc Email"*, nhưng mục TO-BE lại ghi: *"Bỏ trường Email"*.
  - Trong spec gốc (`business_spec_booking.md`), khách dùng Mã lịch + SĐT **hoặc Email** để tra cứu lịch hẹn.
* **Câu hỏi lựa chọn cho Người ra đề:**

> **Chọn phương án cho trường Email:**
> - [x] **Phương án A (Khuyến nghị): Chuyển thành "Không bắt buộc (Optional)"**. Trên giao diện đặt lịch vẫn có ô Email nhưng ghi chú *(Không bắt buộc)*. Khách nào nhập thì lưu, không nhập thì bỏ qua. Tra cứu lịch ưu tiên dùng Số điện thoại.
> - [ ] **Phương án B: Xóa bỏ hoàn toàn trường Email**. Bỏ hẳn ô nhập Email trên cả web và chatbot. Khách hàng 100% chỉ tra cứu và nhận diện bằng Số điện thoại.

---

### VẤN ĐỀ 2: Mâu thuẫn thời gian chờ và nội dung tin nhắn ở bước "Chờ chọn giờ"

* **Bối cảnh & Vấn đề:**
  - Trong bảng quy định của CR: Cột điều kiện kích hoạt ghi **3 phút** (`Chờ chọn giờ (3 phút)`).
  - Nhưng câu tin nhắn tự động gửi cho khách lại ghi: *“Bạn chọn giúp mình một khung giờ trống nhé. Nếu không phản hồi, phiên chat sẽ kết thúc sau **5 phút**.”*
  - Khách hàng sẽ thấy khó hiểu nếu thông báo ghi 5 phút mà hệ thống lại đóng sau 3 phút (hoặc ngược lại).
* **Câu hỏi lựa chọn cho Người ra đề:**

> **Thời gian chờ chọn giờ chính xác là bao nhiêu phút?**
> - [x] **Phương án A (Khuyến nghị): Thống nhất 3 phút**. Tin nhắn sửa lại thành: *"...Nếu không phản hồi, phiên chat sẽ kết thúc sau **3 phút**."* (Tương đương thời gian giữ chỗ).
> - [ ] **Phương án B: Thống nhất 5 phút**. Cả thời gian chờ và nội dung tin nhắn đều đổi thành 5 phút.

---

### VẤN ĐỀ 3: Cơ chế đóng phiên (Đóng ngay hay Đợi thêm một khoảng đệm?)

* **Bối cảnh & Vấn đề:**
  - CR ghi: *"AI đã gửi lời chào nhưng khách không gửi thêm tin nhắn trong 5 phút -> gửi tin: Nếu không phản hồi, phiên chat sẽ kết thúc sau 5 phút."*
  - **Điểm chưa rõ:** Khi chạm mốc 5 phút và bot gửi tin nhắn cảnh báo thì:
    - Bot sẽ **chờ tiếp thêm 5 phút nữa** (tổng cộng 10 phút) rồi mới đóng phiên?
    - Hay bot đã đếm ngược 5 phút từ trước và **đóng phiên ngay lập tức** sau khi gửi tin nhắn đó?
* **Câu hỏi lựa chọn cho Người ra đề:**

> **Quy trình gửi cảnh báo và đóng phiên hoạt động như thế nào?**
> - [x] **Phương án A (Khuyến nghị - Chuẩn UX): Cảnh báo trước khi đóng**.
>   - Sau 3 phút không hoạt động -> Gửi tin nhắn nhắc nhở: *"Bạn còn ở đó không? Phiên chat sẽ tự động kết thúc sau 2 phút nữa nếu không có phản hồi."*
>   - Sau thêm 2 phút (tổng 5 phút) -> Tự động đóng phiên.
> - [ ] **Phương án B: Chờ 5 phút -> Gửi cảnh báo -> Chờ tiếp 5 phút nữa** (Tổng 10 phút mới đóng phiên).
> - [ ] **Phương án C: Chờ đúng 5 phút -> Gửi tin nhắn tạm biệt và Đóng phiên ngay lập tức**.

---

### VẤN ĐỀ 4: Thời gian giữ chỗ (Holding Slot) là 3 phút hay 10 phút?

* **Bối cảnh & Vấn đề:**
  - Trong tài liệu giao diện salon cũ (`N1.QLQTKD.md` dòng 40) quy định: *"Nhận thông báo giữ chỗ tạm thời trong **10 phút**."*
  - Trong file CR mới (`Thay_doi_-_bo_sung.docx`) lại ghi: *"Chờ thông tin khi giữ chỗ (**3 phút**)... giờ giữ sẽ được nhả ra."*
  - 3 phút có thể là hơi ngắn đối với khách hàng vừa suy nghĩ vừa gõ họ tên, số điện thoại và ghi chú trên điện thoại.
* **Câu hỏi lựa chọn cho Người ra đề:**

> **Thời gian giữ chỗ tạm thời (Hold Slot) là bao nhiêu phút?**
> - [x] **Phương án A (Theo CR mới): 3 phút**. Giúp nhả slot nhanh, tránh bị khách ảo giữ slot giờ đẹp quá lâu.
> - [ ] **Phương án B: 5 phút (Cân bằng)**. Đủ thời gian cho khách gõ thông tin mà không sợ bị hết hạn đột ngột.
> - [ ] **Phương án C (Theo tài liệu cũ): 10 phút**. Cho khách thời gian thoải mái suy nghĩ.

---

### VẤN ĐỀ 5: Xử lý khi khách quay lại phiên chat đã đóng (Closed Session)

* **Bối cảnh & Vấn đề:**
  - Phiên chat AI bị tự động đóng sau timeout.
  - Tuy nhiên theo spec tổng thể (`business_spec_booking.md`), khách có thể lưu mã chat để vào lại cuộc trò chuyện cũ.
* **Câu hỏi lựa chọn cho Người ra đề:**

> **Khi một phiên chat đã chuyển sang trạng thái "Closed", nếu khách hàng nhắn tin lại thì hệ thống xử lý ra sao?**
> - [x] **Phương án A (Khuyến nghị): Tự động tạo phiên mới (New Session)**. Lưu trữ đoạn chat cũ thành lịch sử (read-only), bot chào lại từ đầu để bắt đầu luồng tư vấn mới sạch sẽ.
> - [ ] **Phương án B: Mở lại phiên cũ (Re-open)**. Cho phép tiếp tục ngữ cảnh cũ nhưng slot giữ chỗ trước đó đã bị mất, khách phải chọn lại giờ.

---

### VẤN ĐỀ 6: Chế độ "Gặp chuyên viên / Nhân viên thật tiếp nhận" có áp dụng timeout không?

* **Bối cảnh & Vấn đề:**
  - Salon có chức năng khách bấm yêu cầu *"Gặp chuyên viên tư vấn"* (Nhân viên lễ tân/chủ tiệm tiếp nhận qua màn hình quản trị).
  - Nhân viên thật không thể luôn luôn trả lời ngay trong vòng 3–5 phút như AI.
  - Nếu áp dụng quy tắc timeout 5 phút tự động đóng phiên của AI vào lúc này, khách hàng đang chờ nhân viên thật sẽ bị hệ thống bất ngờ đóng khung chat.
* **Câu hỏi lựa chọn cho Người ra đề:**

> **Khi khách hàng bấm yêu cầu chuyển sang nói chuyện với Nhân viên thật:**
> - [x] **Phương án A (Khuyến nghị): Tắt cơ chế tự động đóng phiên**. Giữ phiên mở để nhân viên thật trả lời khi rảnh (theo đúng Mục 9 spec gốc).
> - [ ] **Phương án B: Vẫn áp dụng đóng phiên nhưng tăng thời gian chờ** (Ví dụ: Chờ 30 phút hoặc 60 phút nếu cả khách và nhân viên đều không nhắn gì).

---

## III. BẢNG TỔNG HỢP XÁC NHẬN NHANH (QUICK CHECKLIST)

Người duyệt chỉ cần đánh dấu `[x]` vào phương án mong muốn dưới đây:

| STT | Vấn đề | Lựa chọn phương án | Ghi chú thêm (nếu có) |
| :---: | :--- | :--- | :--- |
| **1** | Trường Email | [ ] Phương án A (Không bắt buộc)<br>[ ] Phương án B (Xóa bỏ hẳn) | |
| **2** | Chờ chọn giờ | [ ] Phương án A (3 phút)<br>[ ] Phương án B (5 phút) | |
| **3** | Cơ chế timeout | [ ] Phương án A (Cảnh báo trước 2p, hết 5p đóng)<br>[ ] Phương án B (Đợi 5p cảnh báo, 5p sau đóng)<br>[ ] Phương án C (Hết 5p gửi tin và đóng ngay) | |
| **4** | Thời gian giữ chỗ | [ ] Phương án A (3 phút)<br>[ ] Phương án B (5 phút)<br>[ ] Phương án C (10 phút) | |
| **5** | Khách nhắn lại khi đã đóng | [ ] Phương án A (Mở phiên mới, lưu lịch sử cũ)<br>[ ] Phương án B (Mở lại phiên cũ) | |
| **6** | Chat với Nhân viên thật | [ ] Phương án A (Tắt timeout đóng phiên)<br>[ ] Phương án B (Kéo dài timeout lên 30–60p) | |

---
*Tài liệu được soạn thảo bởi Technical / BA Team để đảm bảo tính nhất quán trước khi chuyển giao lập trình.*

