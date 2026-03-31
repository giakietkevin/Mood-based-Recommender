const express = require('express');
const WebTorrent = require('webtorrent');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());

// Giới hạn kết nối để server không bị nghẽn
const client = new WebTorrent({
  maxConns: 100,
});

client.on('error', err => {
  console.log('[WebTorrent Error]', err);
});

// Thư mục lưu cache tạm thời để phim stream mượt hơn
const DOWNLOAD_PATH = path.join(__dirname, 'tmp_film_cache');
if (!fs.existsSync(DOWNLOAD_PATH)) {
    fs.mkdirSync(DOWNLOAD_PATH);
}

// Danh sách giữ Torrent để quản lý rác
let activeMagnet = null;

// Hàm normalize url từ yêu cầu client
function getMagnet(req) {
    let magnetURI = req.query.magnet;
    if (!magnetURI) return null;
    
    // Auto inject WebRTC trackers (same as frontend rule)
    const webrtcTrackers = "&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.webtorrent.dev";
    if (!magnetURI.includes('wss%3A%2F%2Ftracker')) {
        magnetURI += webrtcTrackers;
    }
    return magnetURI;
}

app.get('/status', (req, res) => {
    const magnet = getMagnet(req);
    if (!magnet) return res.json({ error: 'Missing magnet parameter' });

    const t = client.get(magnet);
    if (!t) return res.json({ status: 'not_found' });
    
    res.json({
        status: 'active',
        name: t.name,
        progress: t.progress,
        downloadSpeed: t.downloadSpeed,
        downloaded: t.downloaded,
        length: t.length,
        numPeers: t.numPeers,
        timeRemaining: t.timeRemaining,
        ready: t.ready
    });
});

app.get('/stream', (req, res) => {
    const magnet = getMagnet(req);
    if (!magnet) return res.status(400).send('Missing magnet');

    let torrent = client.get(magnet);

    const streamResponse = (t) => {
        const file = t.files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.webm') || f.name.endsWith('.avi')) || t.files.reduce((a, b) => a.length > b.length ? a : b);
        if (!file) {
            return res.status(404).send('No video file found');
        }

        const range = req.headers.range;
        if (!range) {
            res.writeHead(200, {
                'Content-Length': file.length,
                'Content-Type': 'video/mp4'
            });
            const stream = file.createReadStream();
            stream.pipe(res);
            req.on('close', () => stream.destroy());
            return;
        }

        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
        const chunksize = (end - start) + 1;

        res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${file.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize,
            'Content-Type': 'video/mp4'
        });

        const stream = file.createReadStream({ start, end });
        stream.pipe(res);
        
        req.on('close', () => {
            stream.destroy();
        });
    };

    if (torrent) {
        if (torrent.ready) {
            streamResponse(torrent);
        } else {
            torrent.on('ready', () => streamResponse(torrent));
        }
    } else {
        // Hủy torrent cũ để tiết kiệm RAM/Dung lượng
        if (activeMagnet && activeMagnet !== magnet) {
            const oldT = client.get(activeMagnet);
            if (oldT) oldT.destroy();
        }
        activeMagnet = magnet;
        
        client.add(magnet, { path: DOWNLOAD_PATH }, (t) => {
            console.log(`[+] Bắt đầu tải phim: ${t.name}`);
            streamResponse(t);
        });
    }
});

app.get('/cleanup', (req, res) => {
    client.torrents.forEach(t => t.destroy());
    activeMagnet = null;
    res.json({ status: 'cleaned' });
});

const PORT = 8001;
app.listen(PORT, () => {
    console.log(`Node Torrent Streamer chạy ngầm tại port ${PORT}...`);
});
