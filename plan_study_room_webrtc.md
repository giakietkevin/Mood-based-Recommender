# Plan: WebRTC Video Call for Study Room

## 1. HTML Update (`index.html`)
- Add video grid container `#study-room-videos` into `#study-room-container` logic or directly into HTML.
- Add "Toggle Camera" and "Toggle Mic" buttons for the user in the Study Room interface.

## 2. WebRTC Logic (`study-room.js`)
- We need access to local `stream` for Study Room. We will get it via `navigator.mediaDevices.getUserMedia({video: true, audio: true})`.
- Maintain a list of `studyPeers = {}`.
- Implement `createStudyPeer(uid, initiator)` using `SimplePeer`.
  - Pass the local stream.
  - On `signal`, send it to WebSocket via `type: 'broadcast', event: 'study_webrtc_signal'`.
  - On `stream`, create a `<video>` element for the remote peer and attach it to `#study-room-videos`.
  - On `close` / `error`, remove the video element.
- Update `handleStudyRoomMessage` to intercept `presence_state`, `presence_join`, `presence_leave` and `study_webrtc_signal`.
  - On `presence_join`: create initiator peer.
  - On `presence_state`: create initiator peer for everyone currently in the room.
  - On `presence_leave`: destroy the peer.

## 3. Local Stream Management
- Function `toggleStudyMic()`: toggle `stream.getAudioTracks()[0].enabled`.
- Function `toggleStudyCamera()`: toggle `stream.getVideoTracks()[0].enabled`.

Let's modify `js/study-room.js` to implement this.
