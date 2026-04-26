// ==========================================
// STUDY ROOM (CO-WORKING FOCUS MODE)
// ==========================================

let studyRoomActive = false;
let studyRoomId = null;
let studyRoomHost = false;
let studyRoomMembers = {}; // { uid: { name, emotion, status, joinedAt } }
let studyRoomWs = null;
let studyRoomSyncInterval = null;

window.createStudyRoom = async () => {
    if (studyRoomActive) return;

    const roomId = 'study_' + Math.random().toString(36).substr(2, 9);
    const uid = window.currentUserUid || 'user_' + Math.random().toString(36).substr(2, 9);
    const userName = document.getElementById('user-name')?.innerText || 'Anonymous';

    studyRoomId = roomId;
    studyRoomHost = true;
    studyRoomActive = true;

    // Kết nối WebSocket
    connectStudyRoomWs(roomId, uid, userName);

    // Hiển thị UI
    showStudyRoomUI(roomId, userName);
};

window.joinStudyRoom = async (roomId) => {
    if (studyRoomActive) return;

    const uid = window.currentUserUid || 'user_' + Math.random().toString(36).substr(2, 9);
    const userName = document.getElementById('user-name')?.innerText || 'Anonymous';

    studyRoomId = roomId;
    studyRoomHost = false;
    studyRoomActive = true;

    connectStudyRoomWs(roomId, uid, userName);
    showStudyRoomUI(roomId, userName);
};

function connectStudyRoomWs(roomId, uid, userName) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/party/${roomId}/${uid}`;

    studyRoomWs = new WebSocket(wsUrl);

    studyRoomWs.onopen = () => {
        console.log('[StudyRoom] WebSocket connected');
        // Gửi thông tin user
        studyRoomWs.send(JSON.stringify({
            type: 'broadcast',
            event: 'user_info',
            payload: {
                uid: uid,
                name: userName,
                isHost: studyRoomHost,
                emotion: 'neutral',
                status: 'idle'
            }
        }));
    };

    studyRoomWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleStudyRoomMessage(data, uid);
    };

    studyRoomWs.onerror = (error) => {
        console.error('[StudyRoom] WebSocket error:', error);
    };

    studyRoomWs.onclose = () => {
        console.log('[StudyRoom] WebSocket closed');
        leaveStudyRoom();
    };
}

function handleStudyRoomMessage(data, currentUid) {
    const msgType = data.type;

    if (msgType === 'presence_state') {
        // Danh sách thành viên hiện tại
        console.log('[StudyRoom] Members:', data.members);
    } else if (msgType === 'presence_join') {
        // Thành viên mới join
        console.log('[StudyRoom] User joined:', data.uid);
        updateStudyRoomUI();
    } else if (msgType === 'presence_leave') {
        // Thành viên rời
        console.log('[StudyRoom] User left:', data.uid);
        delete studyRoomMembers[data.uid];
        updateStudyRoomUI();
    } else if (msgType === 'broadcast') {
        const event = data.event;
        const payload = data.payload;

        if (event === 'user_info') {
            // Cập nhật thông tin thành viên
            studyRoomMembers[payload.uid] = {
                name: payload.name,
                emotion: payload.emotion,
                status: payload.status,
                isHost: payload.isHost,
                joinedAt: Date.now()
            };
            updateStudyRoomUI();
        } else if (event === 'timer_start') {
            // Host bắt đầu timer
            if (!studyRoomHost) {
                console.log('[StudyRoom] Host started timer');
                // Sync timer từ host
                focusTimeRemaining = payload.timeRemaining || WORK_TIME;
                isFocusWorking = payload.isWorking !== false;
                startFocusTimer();
            }
        } else if (event === 'timer_pause') {
            // Host tạm dừng timer
            if (!studyRoomHost) {
                pauseFocusTimer();
            }
        } else if (event === 'timer_reset') {
            // Host reset timer
            if (!studyRoomHost) {
                resetFocusTimer();
            }
        } else if (event === 'emotion_update') {
            // Cập nhật cảm xúc của thành viên
            if (studyRoomMembers[payload.uid]) {
                studyRoomMembers[payload.uid].emotion = payload.emotion;
                updateStudyRoomUI();
            }
        } else if (event === 'status_update') {
            // Cập nhật trạng thái (working/break)
            if (studyRoomMembers[payload.uid]) {
                studyRoomMembers[payload.uid].status = payload.status;
                updateStudyRoomUI();
            }
        }
    }
}

function showStudyRoomUI(roomId, userName) {
    const container = document.getElementById('study-room-container');
    if (!container) {
        console.warn('[StudyRoom] Container not found');
        return;
    }

    const roomLink = `${window.location.origin}${window.location.pathname}?view=focus&room=${roomId}`;

    container.innerHTML = `
        <div class="glass-card rounded-[2rem] p-6 border border-white/5 shadow-2xl mb-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                    <span class="material-icons-round text-primary text-sm">group</span> Study Room
                </h3>
                <button onclick="window.leaveStudyRoom()" class="text-xs font-bold text-red-400 hover:text-red-300 uppercase tracking-widest flex items-center gap-1">
                    <span class="material-icons-round text-sm">exit_to_app</span> Leave
                </button>
            </div>

            <!-- Room Info -->
            <div class="bg-white/5 rounded-xl p-4 mb-4 border border-white/10">
                <p class="text-xs text-slate-400 mb-2">Room ID:</p>
                <div class="flex items-center gap-2">
                    <code class="text-sm font-mono text-primary flex-1 break-all">${roomId}</code>
                    <button onclick="navigator.clipboard.writeText('${roomLink}'); alert('Link copied!')" class="text-white/50 hover:text-white transition-colors">
                        <span class="material-icons-round text-sm">content_copy</span>
                    </button>
                </div>
            </div>

            <!-- Members List -->
            <div class="mb-4">
                <p class="text-xs text-slate-400 mb-2 font-bold uppercase tracking-widest">Members (${Object.keys(studyRoomMembers).length + 1})</p>
                <div id="study-room-members" class="space-y-2 max-h-48 overflow-y-auto">
                    <!-- Members will be rendered here -->
                </div>
            </div>

            <!-- Room Status -->
            <div class="text-xs text-slate-400 p-3 bg-white/5 rounded-lg border border-white/5">
                <p><span class="material-icons-round text-primary text-xs align-middle">info</span> You are ${studyRoomHost ? 'the host' : 'a member'} of this study room</p>
            </div>
        </div>
    `;

    updateStudyRoomUI();
}

function updateStudyRoomUI() {
    const membersList = document.getElementById('study-room-members');
    if (!membersList) return;

    const emotionEmoji = {
        'joy': '😊',
        'sadness': '😢',
        'anger': '😠',
        'fear': '😨',
        'surprise': '😲',
        'neutral': '😐',
        'calmness': '😌',
        'disgust': '🤢'
    };

    const statusColor = {
        'working': 'bg-primary/20 text-primary',
        'break': 'bg-green-500/20 text-green-400',
        'idle': 'bg-white/10 text-white'
    };

    let html = '';
    for (const [uid, member] of Object.entries(studyRoomMembers)) {
        const emoji = emotionEmoji[member.emotion] || '😐';
        const color = statusColor[member.status] || statusColor['idle'];
        const badge = member.isHost ? '<span class="text-[8px] font-bold text-yellow-400 ml-1">HOST</span>' : '';

        html += `
            <div class="flex items-center gap-3 p-2 rounded-lg bg-white/5 border border-white/10">
                <div class="text-lg">${emoji}</div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-white truncate">${member.name} ${badge}</p>
                    <p class="text-[10px] text-slate-400">${member.status}</p>
                </div>
                <span class="px-2 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest ${color}">
                    ${member.status}
                </span>
            </div>
        `;
    }

    membersList.innerHTML = html || '<p class="text-xs text-slate-500">Waiting for members...</p>';
}

window.leaveStudyRoom = () => {
    if (studyRoomWs) {
        studyRoomWs.close();
    }

    studyRoomActive = false;
    studyRoomId = null;
    studyRoomHost = false;
    studyRoomMembers = {};

    const container = document.getElementById('study-room-container');
    if (container) {
        container.innerHTML = '';
    }

    console.log('[StudyRoom] Left room');
};

// Gửi cập nhật timer khi host thay đổi
window.broadcastTimerEvent = (event, payload = {}) => {
    if (!studyRoomActive || !studyRoomWs || studyRoomWs.readyState !== WebSocket.OPEN) return;

    studyRoomWs.send(JSON.stringify({
        type: 'broadcast',
        event: event,
        payload: {
            ...payload,
            timeRemaining: focusTimeRemaining,
            isWorking: isFocusWorking
        }
    }));
};

// Gửi cập nhật cảm xúc
window.broadcastEmotionUpdate = (emotion) => {
    if (!studyRoomActive || !studyRoomWs || studyRoomWs.readyState !== WebSocket.OPEN) return;

    const uid = window.currentUserUid || 'user_' + Math.random().toString(36).substr(2, 9);
    studyRoomWs.send(JSON.stringify({
        type: 'broadcast',
        event: 'emotion_update',
        payload: {
            uid: uid,
            emotion: emotion
        }
    }));
};

// Gửi cập nhật trạng thái
window.broadcastStatusUpdate = (status) => {
    if (!studyRoomActive || !studyRoomWs || studyRoomWs.readyState !== WebSocket.OPEN) return;

    const uid = window.currentUserUid || 'user_' + Math.random().toString(36).substr(2, 9);
    studyRoomWs.send(JSON.stringify({
        type: 'broadcast',
        event: 'status_update',
        payload: {
            uid: uid,
            status: status
        }
    }));
};
