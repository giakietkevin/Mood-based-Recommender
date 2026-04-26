# Implementation Plan: Study Room (Co-working Space)

## 1. Backend Updates (`main.py`)
- Mở rộng WebSocket manager (`PartyConnectionManager`) để hỗ trợ thêm `room_type` (watch_party hoặc study_room).
- Thêm các event mới cho Study Room: `timer_sync`, `status_update` (working/break), `emotion_update`.
- Thống kê thời gian online.

## 2. Frontend HTML (`index.html`)
- Sửa đổi/Thêm UI cho view Focus Mode (`#view-focus`).
- Thêm nút "Tạo Study Room" và "Tham gia Room".
- Thêm danh sách thành viên trong phòng (Avatar, tên, trạng thái Focus/Break, Cảm xúc hiện tại).
- Thêm nút Copy Link/Mã phòng.

## 3. Frontend JS (`js/focus-mode.js` & `js/app.js`)
- Kết nối WebSocket khi vào phòng Study Room.
- Gửi sự kiện khi Timer bắt đầu/tạm dừng/chuyển đổi (Work <-> Break).
- Đồng bộ Timer: Host quản lý thời gian, các thành viên khác sync theo Host.
- Gửi trạng thái cảm xúc (`analyzeFocusEmotion`) lên WebSocket để mọi người thấy trạng thái của nhau.
- Xử lý link tham gia phòng (`?view=focus&room=...`).
