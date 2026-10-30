"""
Rạp KietStation: phòng chiếu chung.

Server chỉ giữ trạng thái (ai ngồi ghế nào, đang chiếu gì, đang ở giây thứ mấy).
Phim và nhạc do máy mỗi người tự tải từ nguồn gốc.

Mọi thay đổi trạng thái nằm trong các hàm đồng bộ của CinemaManager (không có await),
nên với asyncio một luồng, bước "ghế còn trống?" và bước "gán ghế" không bị chen ngang.
Các hàm trả về danh sách tin nhắn cần gửi; phần gửi (async) làm sau.
"""
import asyncio
import json
import re
import time
from collections import deque
from typing import Callable, Dict, List, Optional, Tuple

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["Cinema"])

SEAT_HOLD_SECONDS = 15
SWEEP_INTERVAL = 5
SEAT_RATE_LIMIT = 5        # số lần seat_request tối đa ...
SEAT_RATE_WINDOW = 1.0     # ... trong khoảng này (giây)
NAME_MAX = 40
ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

UID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
SLUG_RE = re.compile(r"^[a-z0-9-]{1,120}$")

ROOM_CONFIG = [
    {"id": "rap-1", "name": "Rạp 1", "layout": {"rows": 10, "cols": 10, "aisles": [3, 7]}},
    {"id": "rap-2", "name": "Rạp 2", "layout": {"rows": 10, "cols": 10, "aisles": [3, 7]}},
    {"id": "rap-3", "name": "Rạp 3", "layout": {"rows": 10, "cols": 10, "aisles": [3, 7]}},
]

# Một tin nhắn cần gửi: (đích, nội dung). Đích là uid, hoặc None nghĩa là cả phòng.
Outgoing = Tuple[Optional[str], dict]


def _clean_text(value, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:limit]


def _clean_url(value) -> str:
    if isinstance(value, str) and value.startswith(("http://", "https://")) and len(value) <= 2000:
        return value
    return ""


class Room:
    def __init__(self, config: dict):
        self.id = config["id"]
        self.name = config["name"]
        self.layout = dict(config["layout"])
        self.seats: Dict[str, str] = {}          # mã ghế -> uid
        self.members: Dict[str, dict] = {}       # uid -> {name, avatar, seat, ws, left_at}; giữ thứ tự vào phòng
        self.host: Optional[str] = None
        self.media: Optional[dict] = None
        self.playback = {"playing": False, "position": 0.0, "updated_at": 0.0}

    @property
    def total_seats(self) -> int:
        return self.layout["rows"] * self.layout["cols"]

    def seat_exists(self, seat) -> bool:
        if not isinstance(seat, str) or len(seat) < 2:
            return False
        row, col = seat[0], seat[1:]
        if row not in ROW_LETTERS[: self.layout["rows"]] or not col.isdigit():
            return False
        return 1 <= int(col) <= self.layout["cols"] and str(int(col)) == col


class CinemaManager:
    def __init__(self, configs: List[dict] = ROOM_CONFIG, clock: Callable[[], float] = time.time):
        self.clock = clock
        self.rooms: Dict[str, Room] = {c["id"]: Room(c) for c in configs}
        self._seat_requests: Dict[Tuple[str, str], deque] = {}

    # ---------- đọc trạng thái ----------

    def position_now(self, room: Room) -> float:
        pb = room.playback
        if pb["playing"]:
            return pb["position"] + max(0.0, self.clock() - pb["updated_at"])
        return pb["position"]

    def snapshot(self, room: Room) -> dict:
        return {
            "type": "state",
            "room": {"id": room.id, "name": room.name, "layout": room.layout},
            "seats": dict(room.seats),
            "members": [self._member_public(uid, m) for uid, m in room.members.items()],
            "host": room.host,
            "media": room.media,
            "playback": dict(room.playback),
        }

    def summary(self) -> List[dict]:
        out = []
        for room in self.rooms.values():
            media = room.media or {}
            title = media.get("title") or (media.get("track") or {}).get("title")
            out.append({
                "id": room.id,
                "name": room.name,
                "layout": room.layout,
                "occupied": sorted(room.seats),
                "taken": len(room.seats),
                "total": room.total_seats,
                "media_kind": media.get("kind"),
                "media_title": title,
                "media_thumb": media.get("thumb") or (media.get("track") or {}).get("thumbnail"),
                "playing": bool(room.media) and room.playback["playing"],
            })
        return out

    @staticmethod
    def _member_public(uid: str, m: dict) -> dict:
        return {
            "uid": uid,
            "name": m["name"],
            "avatar": m["avatar"],
            "seat": m["seat"],
            "away": m["left_at"] is not None,
        }

    # ---------- vào / ra ----------

    def join(self, room: Room, uid: str, ws=None) -> Tuple[List[Outgoing], object]:
        """Thêm người vào phòng, hoặc nối lại nếu uid đang được giữ chỗ.
        Trả về (tin nhắn, ws cũ cần đóng nếu cùng uid mở tab khác)."""
        old_ws = None
        member = room.members.get(uid)
        if member:
            old_ws = member["ws"] if member["ws"] is not ws else None
            member["ws"] = ws
            was_away = member["left_at"] is not None
            member["left_at"] = None
            msgs: List[Outgoing] = []
            if was_away:
                msgs.append((None, {"type": "member_join", "member": self._member_public(uid, member)}))
            return msgs, old_ws

        room.members[uid] = {"name": "Khách", "avatar": "", "seat": None, "ws": ws, "left_at": None}
        msgs = [(None, {"type": "member_join", "member": self._member_public(uid, room.members[uid])})]
        if room.host is None:
            room.host = uid
            msgs.append((None, {"type": "host_changed", "host": uid}))
        return msgs, None

    def hello(self, room: Room, uid: str, name, avatar) -> List[Outgoing]:
        member = room.members.get(uid)
        if not member:
            return []
        member["name"] = _clean_text(name, NAME_MAX) or "Khách"
        member["avatar"] = _clean_url(avatar)
        return [
            (uid, self.snapshot(room)),
            (None, {"type": "member_update", "member": self._member_public(uid, member)}),
        ]

    def disconnect(self, room: Room, uid: str, ws=None) -> List[Outgoing]:
        """Mất kết nối: giữ ghế SEAT_HOLD_SECONDS giây rồi mới trả."""
        member = room.members.get(uid)
        if not member or (ws is not None and member["ws"] is not ws):
            return []  # ws cũ đã bị thay bằng kết nối mới của cùng uid
        member["ws"] = None
        member["left_at"] = self.clock()
        return [(None, {"type": "member_away", "uid": uid})]

    def leave(self, room: Room, uid: str) -> List[Outgoing]:
        """Rời hẳn phòng: trả ghế, chuyển chủ phòng nếu cần."""
        member = room.members.pop(uid, None)
        if not member:
            return []
        msgs: List[Outgoing] = []
        if member["seat"]:
            room.seats.pop(member["seat"], None)
            msgs.append((None, {"type": "seat_changed", "seat": member["seat"], "uid": None}))
        msgs.append((None, {"type": "member_leave", "uid": uid}))
        self._seat_requests.pop((room.id, uid), None)
        if room.host == uid:
            room.host = next(iter(room.members), None)
            msgs.append((None, {"type": "host_changed", "host": room.host}))
        if not room.members:
            room.media = None
            room.playback = {"playing": False, "position": 0.0, "updated_at": self.clock()}
        return msgs

    def sweep(self, room: Room) -> List[Outgoing]:
        """Trả ghế của những người đã mất kết nối quá thời gian giữ chỗ."""
        now = self.clock()
        expired = [uid for uid, m in room.members.items()
                   if m["left_at"] is not None and now - m["left_at"] >= SEAT_HOLD_SECONDS]
        msgs: List[Outgoing] = []
        for uid in expired:
            msgs.extend(self.leave(room, uid))
        return msgs

    # ---------- ghế ----------

    def _rate_limited(self, room: Room, uid: str) -> bool:
        now = self.clock()
        q = self._seat_requests.setdefault((room.id, uid), deque())
        while q and now - q[0] >= SEAT_RATE_WINDOW:
            q.popleft()
        if len(q) >= SEAT_RATE_LIMIT:
            return True
        q.append(now)
        return False

    def request_seat(self, room: Room, uid: str, seat) -> List[Outgoing]:
        member = room.members.get(uid)
        if not member:
            return []
        if self._rate_limited(room, uid):
            return [(uid, {"type": "seat_denied", "seat": seat, "reason": "too_fast"})]
        if not room.seat_exists(seat):
            return [(uid, {"type": "seat_denied", "seat": seat, "reason": "invalid"})]
        holder = room.seats.get(seat)
        if holder == uid:
            return [(uid, {"type": "seat_changed", "seat": seat, "uid": uid})]
        if holder is not None:
            return [(uid, {"type": "seat_denied", "seat": seat, "reason": "taken"})]

        # Trả ghế cũ và lấy ghế mới trong cùng một bước.
        msgs: List[Outgoing] = []
        old = member["seat"]
        if old:
            room.seats.pop(old, None)
            msgs.append((None, {"type": "seat_changed", "seat": old, "uid": None}))
        room.seats[seat] = uid
        member["seat"] = seat
        msgs.append((None, {"type": "seat_changed", "seat": seat, "uid": uid}))
        return msgs

    def release_seat(self, room: Room, uid: str) -> List[Outgoing]:
        member = room.members.get(uid)
        if not member or not member["seat"]:
            return []
        seat = member["seat"]
        room.seats.pop(seat, None)
        member["seat"] = None
        return [(None, {"type": "seat_changed", "seat": seat, "uid": None})]

    # ---------- nội dung và phát ----------

    def _host_only(self, room: Room, uid: str, action: str) -> Optional[List[Outgoing]]:
        if room.host != uid:
            return [(uid, {"type": "denied", "action": action, "reason": "not_host"})]
        return None

    def set_media(self, room: Room, uid: str, data: dict) -> List[Outgoing]:
        denied = self._host_only(room, uid, "media_set")
        if denied:
            return denied
        kind = data.get("kind")
        if kind == "film":
            slug = data.get("slug")
            ep = data.get("ep", 0)
            if not isinstance(slug, str) or not SLUG_RE.match(slug):
                return [(uid, {"type": "denied", "action": "media_set", "reason": "invalid"})]
            if not isinstance(ep, int) or isinstance(ep, bool) or not 0 <= ep <= 2000:
                return [(uid, {"type": "denied", "action": "media_set", "reason": "invalid"})]
            media = {
                "kind": "film",
                "slug": slug,
                "ep": ep,
                "title": _clean_text(data.get("title"), 160),
                "thumb": _clean_url(data.get("thumb")),
            }
        elif kind == "music":
            track = data.get("track") or {}
            link = _clean_url(track.get("link"))
            if not isinstance(track, dict) or not link:
                return [(uid, {"type": "denied", "action": "media_set", "reason": "invalid"})]
            media = {
                "kind": "music",
                "track": {
                    "title": _clean_text(track.get("title"), 160),
                    "artist": _clean_text(track.get("artist"), 160),
                    "thumbnail": _clean_url(track.get("thumbnail")),
                    "link": link,
                },
            }
        else:
            return [(uid, {"type": "denied", "action": "media_set", "reason": "invalid"})]

        room.media = media
        room.playback = {"playing": False, "position": 0.0, "updated_at": self.clock()}
        return [(None, {"type": "media", "media": media, "playback": dict(room.playback)})]

    def set_playback(self, room: Room, uid: str, action: str, position=None) -> List[Outgoing]:
        denied = self._host_only(room, uid, action)
        if denied:
            return denied
        if room.media is None:
            return [(uid, {"type": "denied", "action": action, "reason": "no_media"})]
        if position is not None:
            if not isinstance(position, (int, float)) or isinstance(position, bool) or not 0 <= position <= 86400:
                return [(uid, {"type": "denied", "action": action, "reason": "invalid"})]
        pos = float(position) if position is not None else self.position_now(room)
        if action == "play":
            playing = True
        elif action == "pause":
            playing = False
        elif action == "seek":
            if position is None:
                return [(uid, {"type": "denied", "action": action, "reason": "invalid"})]
            playing = room.playback["playing"]
        else:
            return []
        room.playback = {"playing": playing, "position": pos, "updated_at": self.clock()}
        return [(None, {"type": "playback", "playback": dict(room.playback)})]

    # ---------- xử lý tin nhắn ----------

    def handle(self, room: Room, uid: str, data) -> List[Outgoing]:
        if not isinstance(data, dict):
            return []
        t = data.get("type")
        if t == "hello":
            return self.hello(room, uid, data.get("name"), data.get("avatar"))
        if t == "seat_request":
            return self.request_seat(room, uid, data.get("seat"))
        if t == "seat_leave":
            return self.release_seat(room, uid)
        if t == "media_set":
            return self.set_media(room, uid, data)
        if t in ("play", "pause", "seek"):
            return self.set_playback(room, uid, t, data.get("position"))
        if t == "ping":
            return [(uid, {"type": "pong"})]
        return []

    async def deliver(self, room: Room, msgs: List[Outgoing]) -> None:
        for target, msg in msgs:
            msg["server_time"] = self.clock()
            if target is None:
                sockets = [m["ws"] for m in list(room.members.values()) if m["ws"] is not None]
            else:
                m = room.members.get(target)
                sockets = [m["ws"]] if m and m["ws"] is not None else []
            for ws in sockets:
                try:
                    await ws.send_json(msg)
                except Exception:
                    pass


cinema = CinemaManager()
_sweeper: Optional[asyncio.Task] = None


async def _sweep_loop():
    while True:
        await asyncio.sleep(SWEEP_INTERVAL)
        for room in cinema.rooms.values():
            msgs = cinema.sweep(room)
            if msgs:
                await cinema.deliver(room, msgs)


def _ensure_sweeper():
    global _sweeper
    if _sweeper is None or _sweeper.done():
        _sweeper = asyncio.get_running_loop().create_task(_sweep_loop())


@router.get("/cinema/rooms")
async def list_cinema_rooms():
    return cinema.summary()


@router.websocket("/ws/cinema/{room_id}/{uid}")
async def cinema_websocket(websocket: WebSocket, room_id: str, uid: str):
    room = cinema.rooms.get(room_id)
    if room is None or not UID_RE.match(uid):
        await websocket.close(code=4404)
        return
    await websocket.accept()
    _ensure_sweeper()

    msgs, old_ws = cinema.join(room, uid, websocket)
    if old_ws is not None:
        try:
            await old_ws.send_json({"type": "replaced", "server_time": cinema.clock()})
            await old_ws.close(code=4001)
        except Exception:
            pass
    await cinema.deliver(room, msgs + [(uid, cinema.snapshot(room))])

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except ValueError:
                continue
            if isinstance(data, dict) and data.get("type") == "leave":
                await cinema.deliver(room, cinema.leave(room, uid))
                await websocket.close()
                return
            await cinema.deliver(room, cinema.handle(room, uid, data))
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    await cinema.deliver(room, cinema.disconnect(room, uid, websocket))
