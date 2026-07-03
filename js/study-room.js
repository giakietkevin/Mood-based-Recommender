// ==========================================
// STUDY ROOM (CO-WORKING FOCUS MODE) WITH WEBRTC
// ==========================================

let studyRoomActive = false;
let studyRoomId = null;
let studyRoomHost = false;
let studyRoomMembers = {}; // { uid: { name, emotion, status, joinedAt } }
let studyRoomWs = null;
let studyRoomMyUid = null;

// WebRTC
let studyLocalStream = null;
let studyPeers = {}; // { uid: SimplePeer }
let studyMicEnabled = true;
let studyCameraEnabled = true;
let studyStreamReady = false; // Flag to ensure stream is initialized

window.createStudyRoom = async () => {
    if (studyRoomActive) return;

    const roomId = 'study_' + Math.random().toString(36).substr(2, 9);
    const uid = window.currentUserUid || 'user_' + Math.random().toString(36).substr(2, 9);
    const userName = document.getElementById('user-name')?.innerText || 'Anonymous';

    studyRoomId = roomId;
    studyRoomMyUid = uid;
    studyRoomHost = true;
    studyRoomActive = true;

    // Hiển thị UI trước để local video element tồn tại
    showStudyRoomUI(roomId, userName);

    // Lấy stream TRƯỚC khi kết nối WebSocket
    const ok = await initStudyStream();
    if (!ok) {
        studyRoomActive = false;
        document.getElementById('study-room-container').innerHTML = '';
        return;
    }

    // Kết nối WebSocket sau khi đã có stream
    connectStudyRoomWs(roomId, uid, userName);
};

window.joinStudyRoom = async (roomId) => {
    if (studyRoomActive) return;
    if (!roomId || roomId.trim() === '') {
        alert('Please enter a valid Room ID');
        return;
    }

    const uid = window.currentUserUid || 'user_' + Math.random().toString(36).substr(2, 9);
    const userName = document.getElementById('user-name')?.innerText || 'Anonymous';

    studyRoomId = roomId;
    studyRoomMyUid = uid;
    studyRoomHost = false;
    studyRoomActive = true;

    // Hiển thị UI trước để local video element tồn tại
    showStudyRoomUI(roomId, userName);

    // Lấy stream TRƯỚC khi kết nối WebSocket
    const ok = await initStudyStream();
    if (!ok) {
        studyRoomActive = false;
        document.getElementById('study-room-container').innerHTML = '';
        return;
    }

    // Kết nối WebSocket sau khi đã có stream
    connectStudyRoomWs(roomId, uid, userName);
};

function connectStudyRoomWs(roomId, uid, userName) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/party/${roomId}/${uid}`;

    studyRoomWs = new WebSocket(wsUrl);

    studyRoomWs.onopen = () => {
        console.log('[StudyRoom] WebSocket connected');

        // Stream already initialized before connecting
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

async function initStudyStream() {
    try {
        studyLocalStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        // Display local video
        const localVideo = document.getElementById('study-local-video');
        if (localVideo) {
            localVideo.srcObject = studyLocalStream;
            localVideo.muted = true; // Mute own audio to avoid feedback
            localVideo.play();
        }

        studyStreamReady = true;
        console.log('[StudyRoom] Local stream initialized successfully');
        return true;
    } catch (error) {
        console.error('[StudyRoom] Failed to get local stream:', error);
        alert('Could not access camera/microphone. Please grant permissions to join the Study Room.');
        return false;
    }
}

function createStudyPeer(uid, initiator) {
    if (studyPeers[uid]) {
        console.warn('[StudyRoom] Peer already exists:', uid);
        return;
    }

    console.log('[StudyRoom] Creating peer:', uid, 'initiator:', initiator);

    const peer = new SimplePeer({
        initiator: initiator,
        stream: studyLocalStream,
        trickle: true
    });

    peer.on('signal', (signal) => {
        console.log('[StudyRoom] Sending signal to:', uid);
        if (studyRoomWs && studyRoomWs.readyState === WebSocket.OPEN) {
            studyRoomWs.send(JSON.stringify({
                type: 'broadcast',
                event: 'study_webrtc_signal',
                payload: {
                    from: studyRoomMyUid,
                    target: uid,
                    signal: signal
                }
            }));
        }
    });

    peer.on('stream', (remoteStream) => {
        console.log('[StudyRoom] Received stream from:', uid);
        addRemoteVideo(uid, remoteStream);
    });

    peer.on('close', () => {
        console.log('[StudyRoom] Peer closed:', uid);
        removeRemoteVideo(uid);
        delete studyPeers[uid];
    });

    peer.on('error', (err) => {
        console.error('[StudyRoom] Peer error:', uid, err);
        removeRemoteVideo(uid);
        delete studyPeers[uid];
    });

    studyPeers[uid] = peer;
}

function addRemoteVideo(uid, stream) {
    const container = document.getElementById('study-room-videos');
    if (!container) {
        console.error('[StudyRoom] study-room-videos container not found!');
        return;
    }

    // Remove existing video if any
    removeRemoteVideo(uid);

    const memberName = studyRoomMembers[uid]?.name || 'Unknown';
    console.log('[StudyRoom] Adding remote video for:', uid, memberName);

    const videoWrapper = document.createElement('div');
    videoWrapper.id = `study-video-${uid}`;
    videoWrapper.className = 'relative rounded-xl overflow-hidden bg-black/50 border border-white/10 shadow-lg aspect-video';

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.className = 'w-full h-full object-cover';
    // Assign srcObject AFTER appending to DOM to avoid race condition
    video.srcObject = stream;

    const nameLabel = document.createElement('div');
    nameLabel.className = 'absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded-lg text-xs font-bold text-white';
    nameLabel.innerText = memberName;

    videoWrapper.appendChild(video);
    videoWrapper.appendChild(nameLabel);
    container.appendChild(videoWrapper);

    // Force play (some browsers need this)
    video.play().catch(e => console.warn('[StudyRoom] Video play error:', e));
}

function removeRemoteVideo(uid) {
    const videoEl = document.getElementById(`study-video-${uid}`);
    if (videoEl) videoEl.remove();
}

function handleStudyRoomMessage(data, currentUid) {
    const msgType = data.type;
    console.log('[StudyRoom] Received message:', msgType, data);

    if (msgType === 'presence_state') {
        // Danh sách thành viên hiện tại
        console.log('[StudyRoom] Members:', data.members);
        const members = data.members || [];
        members.forEach(uid => {
            if (uid !== currentUid && !studyPeers[uid]) {
                console.log('[StudyRoom] Creating peer for existing member:', uid);
                createStudyPeer(uid, true);
            }
        });
    } else if (msgType === 'presence_join') {
        // Thành viên mới join
        const uid = data.uid;
        console.log('[StudyRoom] User joined:', uid);
        // DO NOT create peer here. Wait for their offer signal to arrive first.
        updateStudyRoomUI();
    } else if (msgType === 'presence_leave') {
        // Thành viên rời
        const uid = data.uid;
        console.log('[StudyRoom] User left:', uid);
        if (studyPeers[uid]) {
            studyPeers[uid].destroy();
            delete studyPeers[uid];
        }
        removeRemoteVideo(uid);
        delete studyRoomMembers[uid];
        updateStudyRoomUI();
    } else if (msgType === 'broadcast') {
        const event = data.event;
        const payload = data.payload;

        if (event === 'user_info') {
            // Cập nhật thông tin thành viên
            console.log('[StudyRoom] Received user_info:', payload);
            studyRoomMembers[payload.uid] = {
                name: payload.name,
                emotion: payload.emotion,
                status: payload.status,
                isHost: payload.isHost,
                joinedAt: Date.now()
            };
            updateStudyRoomUI();
        } else if (event === 'study_webrtc_signal') {
            // WebRTC signaling
            const { from, target, signal } = payload;
            console.log('[StudyRoom] Received WebRTC signal from:', from, 'to:', target, 'currentUid:', currentUid);
            if (target === currentUid) {
                console.log('[StudyRoom] Signal is for me!');
                if (!studyPeers[from]) {
                    console.log('[StudyRoom] Peer does not exist, creating as non-initiator');
                    createStudyPeer(from, false);
                    // Wait a bit for peer to be ready before signaling
                    setTimeout(() => {
                        if (studyPeers[from]) {
                            console.log('[StudyRoom] Signaling peer (delayed):', from);
                            studyPeers[from].signal(signal);
                        }
                    }, 100);
                } else {
                    console.log('[StudyRoom] Peer already exists, signaling immediately:', from);
                    studyPeers[from].signal(signal);
                }
            }
        } else if (event === 'timer_start') {
            // Host bắt đầu timer
            if (!studyRoomHost) {
                console.log('[StudyRoom] Host started timer');
                focusTimeRemaining = payload.timeRemaining || WORK_TIME;
                isFocusWorking = payload.isWorking !== false;
                startFocusTimer();
            }
        } else if (event === 'timer_pause') {
            if (!studyRoomHost) pauseFocusTimer();
        } else if (event === 'timer_reset') {
            if (!studyRoomHost) resetFocusTimer();
        } else if (event === 'emotion_update') {
            if (studyRoomMembers[payload.uid]) {
                studyRoomMembers[payload.uid].emotion = payload.emotion;
                updateStudyRoomUI();
            }
        } else if (event === 'status_update') {
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
                <div class="flex items-center gap-2">
                    <button onclick="window.toggleStudyCamera()" id="btn-toggle-camera" class="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1">
                        <span class="material-icons-round text-sm">videocam</span>
                    </button>
                    <button onclick="window.toggleStudyMic()" id="btn-toggle-mic" class="bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1">
                        <span class="material-icons-round text-sm">mic</span>
                    </button>
                    <button onclick="window.leaveStudyRoom()" class="text-xs font-bold text-red-400 hover:text-red-300 uppercase tracking-widest flex items-center gap-1 px-3 py-2">
                        <span class="material-icons-round text-sm">exit_to_app</span> Leave
                    </button>
                </div>
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

            <!-- Video Grid -->
            <div class="mb-4">
                <p class="text-xs text-slate-400 mb-2 font-bold uppercase tracking-widest">Video Feeds</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <!-- Local Video -->
                    <div class="relative rounded-xl overflow-hidden bg-black/50 border border-primary/30 shadow-lg aspect-video">
                        <video id="study-local-video" autoplay playsinline muted class="w-full h-full object-cover"></video>
                        <div class="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded-lg text-xs font-bold text-white flex items-center gap-1">
                            <span class="material-icons-round text-xs text-primary">person</span> You
                        </div>
                    </div>
                    <!-- Remote Videos (added dynamically) -->
                </div>
                <div id="study-room-videos" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3"></div>
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

window.toggleStudyCamera = () => {
    if (!studyLocalStream) return;

    const videoTrack = studyLocalStream.getVideoTracks()[0];
    if (videoTrack) {
        studyCameraEnabled = !studyCameraEnabled;
        videoTrack.enabled = studyCameraEnabled;

        const btn = document.getElementById('btn-toggle-camera');
        if (btn) {
            btn.innerHTML = studyCameraEnabled
                ? '<span class="material-icons-round text-sm">videocam</span>'
                : '<span class="material-icons-round text-sm">videocam_off</span>';
            btn.className = studyCameraEnabled
                ? 'bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1'
                : 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 px-3 py-2 rounded-xl text-xs font-bold text-red-400 transition-all flex items-center gap-1';
        }
    }
};

window.toggleStudyMic = () => {
    if (!studyLocalStream) return;

    const audioTrack = studyLocalStream.getAudioTracks()[0];
    if (audioTrack) {
        studyMicEnabled = !studyMicEnabled;
        audioTrack.enabled = studyMicEnabled;

        const btn = document.getElementById('btn-toggle-mic');
        if (btn) {
            btn.innerHTML = studyMicEnabled
                ? '<span class="material-icons-round text-sm">mic</span>'
                : '<span class="material-icons-round text-sm">mic_off</span>';
            btn.className = studyMicEnabled
                ? 'bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1'
                : 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 px-3 py-2 rounded-xl text-xs font-bold text-red-400 transition-all flex items-center gap-1';
        }
    }
};

function stopStudyStream() {
    // Stop all peer connections
    for (const uid in studyPeers) {
        studyPeers[uid].destroy();
        removeRemoteVideo(uid);
    }
    studyPeers = {};

    // Stop local stream
    if (studyLocalStream) {
        studyLocalStream.getTracks().forEach(track => track.stop());
        studyLocalStream = null;
    }
}

window.leaveStudyRoom = () => {
    if (studyRoomWs) {
        studyRoomWs.close();
    }

    stopStudyStream();

    studyRoomActive = false;
    studyRoomId = null;
    studyRoomHost = false;
    studyRoomMembers = {};
    studyRoomMyUid = null;

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

    studyRoomWs.send(JSON.stringify({
        type: 'broadcast',
        event: 'emotion_update',
        payload: {
            uid: studyRoomMyUid,
            emotion: emotion
        }
    }));
};

// Gửi cập nhật trạng thái
window.broadcastStatusUpdate = (status) => {
    if (!studyRoomActive || !studyRoomWs || studyRoomWs.readyState !== WebSocket.OPEN) return;

    studyRoomWs.send(JSON.stringify({
        type: 'broadcast',
        event: 'status_update',
        payload: {
            uid: studyRoomMyUid,
            status: status
        }
    }));
};
