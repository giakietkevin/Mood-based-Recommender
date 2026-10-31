// Rạp KietStation vẽ bằng WebGL (Three.js), nằm phía sau lớp DOM của cinema.js.
// Camera không tự tính: mỗi frame đọc transform CSS của .cine-world (cinema.js đặt, kể cả lúc đang chuyển góc
// nhìn mượt) rồi đổi sang camera Three. Nhờ vậy người ngồi, bong bóng chat, số ghế và chữ trên màn chiếu (vẫn là
// DOM) luôn khớp với phòng. Đơn vị là px như bên CSS; khác một điều: ở đây trục y hướng lên.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

const TEX = '/assets/cinema/';
const SCREEN_R = 2400;            // bán kính cong của màn chiếu: hai mép tiến về phía khán giả chừng 80px
const LIGHT_TAU = 1.1;            // giây; đèn đổi dần, khoảng 3,5 giây là xong như bên CSS
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export function supported() {
    try {
        const c = document.createElement('canvas');
        return !!(window.WebGL2RenderingContext && c.getContext('webgl2'));
    } catch (e) {
        return false;
    }
}

// Mặt cong theo hình trụ đứng: dựng từ mặt phẳng rồi uốn, để giữ nguyên UV (video không bị lật).
function curved(w, h, r) {
    const g = new THREE.PlaneGeometry(w, h, 48, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const a = pos.getX(i) / r;
        pos.setX(i, r * Math.sin(a));
        pos.setZ(i, r * (1 - Math.cos(a)));
    }
    g.computeVertexNormals();
    return g;
}

// Đọc transform đã tính của CSS (matrix hoặc matrix3d) vào Matrix4.
function cssMatrix(str, out) {
    const m = /matrix(3d)?\(([^)]+)\)/.exec(str || '');
    if (!m) return false;
    const v = m[2].split(',').map(Number);
    if (m[1]) out.fromArray(v);
    else out.set(v[0], v[2], 0, v[4], v[1], v[3], 0, v[5], 0, 0, 1, 0, 0, 0, 0, 1);
    return true;
}

function exitSignTexture() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 72;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1f8a4c';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#e9fff1';
    ctx.font = '600 40px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LỐI RA', c.width / 2, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

export function create(stage, root, opts) {
    const world = stage.querySelector('#cine-world');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const canvas = renderer.domElement;
    canvas.className = 'cine-gl';
    canvas.setAttribute('aria-hidden', 'true');
    stage.insertBefore(canvas, stage.firstChild);
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('lost'); });

    RectAreaLightUniformsLib.init();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070606);
    scene.fog = new THREE.FogExp2(0x070606, 0.00011);
    const camera = new THREE.PerspectiveCamera(50, 1, 2, 8000);
    camera.matrixAutoUpdate = false;

    // ---------- vật liệu ----------
    // Mỗi bề mặt nạp ảnh riêng với số lần lặp riêng (như background-size bên CSS); ảnh nhỏ và trình duyệt đã
    // giữ trong bộ nhớ đệm, nên nạp lại rẻ hơn chia sẻ một texture rồi canh lúc ảnh về.
    const loader = new THREE.TextureLoader();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    function tex(name, w, h, size) {
        const t = loader.load(TEX + name + '.jpg');
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = maxAniso;
        t.repeat.set(w / size, h / size);
        return t;
    }

    // Những gì build() tạo ra, để dựng lại (đổi sơ đồ ghế) thì giải phóng hết.
    let owned = [];
    function own(x) { owned.push(x); return x; }
    function mat(name, w, h, size, color, rough) {
        return own(new THREE.MeshStandardMaterial({
            map: own(tex(name, w, h, size)),
            color: color,
            roughness: rough === undefined ? 0.95 : rough,
            metalness: 0,
        }));
    }

    // ---------- đèn ----------
    // Đèn rạp: ánh sáng chung và bốn đèn rọi từ trần, mạnh yếu theo class lights-on/half của cinema.js.
    const hemi = new THREE.HemisphereLight(0xfff1dc, 0x2a2224, 1);
    scene.add(hemi);
    const spots = [];
    [-1300, -500].forEach((z) => {
        [-1, 1].forEach((side) => {
            const s = new THREE.SpotLight(0xffe6c4, 0, 0, 0.95, 0.7, 0);
            s.position.set(side * 350, 990, z);
            s.target.position.set(side * 300, 0, z + 150);
            scene.add(s, s.target);
            spots.push(s);
        });
    });
    // Màn chiếu là một mặt phát sáng: chiếu lên ghế, tường và trần khi đang chiếu phim.
    const screenLight = new THREE.RectAreaLight(0xdfe6ff, 0, 1240, 697.5);
    scene.add(screenLight);

    const hall = new THREE.Group();
    scene.add(hall);
    const live = { sconce: null, down: null };
    let rowGroups = [];
    let seatIndex = {};           // mã ghế -> {group, meshes, i, mats}
    const mine = {};              // mã ghế -> true: ghế của mình
    let mineMeshes = [];          // lưng + đệm màu xanh chanh, đặt vào chỗ ghế của mình
    let mineAt = null;            // mã ghế đang đặt mineMeshes
    let screen = null;            // {group, blankMat, videoMat, videoMesh, W, H}

    function clearHall() {
        hall.clear();
        owned.forEach((x) => x.dispose());
        owned = [];
        rowGroups = [];
        seatIndex = {};
    }

    function add(geo, material, x, y, z) {
        const m = new THREE.Mesh(own(geo), material);
        m.position.set(x, y, z);
        hall.add(m);
        return m;
    }

    function build(spec) {
        clearHall();
        const H = spec.H;
        const wide = H.halfW * 2;
        const wallH = -H.ceilY;
        const depth = H.backZ - H.screenZ;
        const midZ = (H.backZ + H.screenZ) / 2;

        live.sconce = own(new THREE.MeshStandardMaterial({ color: 0x3d3127, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.6 }));
        live.down = own(new THREE.MeshStandardMaterial({ color: 0x2b2622, emissive: 0xfff0d2, emissiveIntensity: 0 }));
        const lampMat = own(new THREE.MeshBasicMaterial({ color: 0xe2a646 }));

        // tường hai bên: vải tiêu âm, các tấm tiêu âm nổi, đèn tường giữa các tấm và biển lối ra gần màn chiếu
        const wallMat = mat('velour', depth, wallH, 240, 0x8e898a);
        const panelMat = mat('panel', 150, 540, 150, 0xaba29d, 0.9);
        const exitMat = own(new THREE.MeshBasicMaterial({ map: own(exitSignTexture()) }));
        [-1, 1].forEach((side) => {
            const turn = -side * Math.PI / 2;    // mặt tường quay vào trong rạp
            add(new THREE.PlaneGeometry(depth, wallH), wallMat, side * H.halfW, wallH / 2, midZ).rotation.y = turn;
            for (let k = 0; k < 9; k++) {
                add(new THREE.BoxGeometry(150, 540, 8), panelMat, side * (H.halfW - 4), 570, H.screenZ + 135 + k * 210).rotation.y = turn;
            }
            for (let k = 0; k < 4; k++) {
                add(new RoundedBoxGeometry(46, 64, 12, 2, 5), live.sconce, side * (H.halfW - 6), 878, H.screenZ + 450 + k * 420).rotation.y = turn;
            }
            add(new THREE.PlaneGeometry(128, 36), exitMat, side * (H.halfW - 2), 689, H.screenZ + 240).rotation.y = turn;
        });

        // trần có ba dãy đèn âm trần
        add(new THREE.PlaneGeometry(wide, depth), mat('velour', wide, depth, 260, 0x5f5b5c), 0, wallH, midZ).rotation.x = Math.PI / 2;
        for (let a = 0; a < 3; a++) {
            for (let b = 0; b < 6; b++) {
                add(new THREE.CircleGeometry(17, 24), live.down, wide * (a + 1) / 4 - H.halfW, wallH - 1, H.screenZ + 177 + b * 300).rotation.x = Math.PI / 2;
            }
        }

        // tường trước (sau màn chiếu) và tường sau có ô kính phòng máy chiếu
        add(new THREE.PlaneGeometry(wide, wallH), mat('velour', wide, wallH, 240, 0x2e2b2c), 0, wallH / 2, H.screenZ - 6);
        add(new THREE.PlaneGeometry(wide, wallH), mat('velour', wide, wallH, 240, 0x7c7778), 0, wallH / 2, H.backZ).rotation.y = Math.PI;
        add(new THREE.PlaneGeometry(90, 54), own(new THREE.MeshBasicMaterial({ color: 0xe9e6e3 })), 0, 753, H.backZ - 1).rotation.y = Math.PI;

        // sàn trước hàng A, rồi mỗi hàng một bậc: mặt bậc trải thảm, thành bậc có đèn lối đi
        const rows = spec.rows;
        const frontEnd = rows.length ? rows[0].z + 15 : H.backZ;
        add(new THREE.PlaneGeometry(wide, frontEnd - H.screenZ), mat('carpet', wide, frontEnd - H.screenZ, 220, 0xa3a4b3),
            0, 0, (H.screenZ + frontEnd) / 2).rotation.x = -Math.PI / 2;
        rows.forEach((row, r) => {
            if (r === 0) return;
            const z0 = row.z - 95;
            const z1 = r === rows.length - 1 ? H.backZ : row.z + 15;
            add(new THREE.PlaneGeometry(wide, z1 - z0), mat('carpet', wide, z1 - z0, 220, 0xa3a4b3), 0, row.y, (z0 + z1) / 2).rotation.x = -Math.PI / 2;
            const riser = add(new THREE.PlaneGeometry(wide, H.step), mat('carpet', wide, H.step, 220, 0x5c5c68), 0, row.y - H.step / 2, z0);
            riser.rotation.y = Math.PI;
            row.lamps.forEach((x) => add(new THREE.BoxGeometry(8, 4, 1), lampMat, x, row.y - 14, z0 - 0.5));
        });

        // ghế: mỗi hàng ba InstancedMesh (lưng, đệm, tay vịn), để ẩn được cả hàng khi camera đi xuyên qua
        const velvet = mat('velvet', 58, 78, 64, 0xe2d8d8, 0.85);
        // ghế của mình không nhân màu với vải nhung đỏ được (ra màu bùn): tách thành mesh riêng màu xanh chanh
        const limeMat = own(new THREE.MeshStandardMaterial({ color: 0xc6f24e, emissive: 0xc6f24e, emissiveIntensity: 0.12, roughness: 0.75 }));
        const armMat = own(new THREE.MeshStandardMaterial({ color: 0x2a2627, roughness: 0.55 }));
        const backGeo = own(new RoundedBoxGeometry(58, 78, 14, 3, 6));
        const cushGeo = own(new RoundedBoxGeometry(54, 12, 48, 2, 5));
        const armGeo = own(new RoundedBoxGeometry(8, 58, 58, 2, 3));
        mineAt = null;
        mineMeshes = [backGeo, cushGeo].map((geo) => {
            const m = new THREE.Mesh(geo, limeMat);
            m.matrixAutoUpdate = false;
            return m;
        });
        const o = new THREE.Object3D();
        rows.forEach((row) => {
            const g = new THREE.Group();
            const n = row.seats.length;
            const backs = new THREE.InstancedMesh(backGeo, velvet, n);
            const cush = new THREE.InstancedMesh(cushGeo, velvet, n);
            // tay vịn giữa hai ghế liền nhau dùng chung, chỗ có lối đi thì mỗi bên một cái
            const armXs = [];
            row.seats.forEach((s) => {
                [s.x - 40, s.x + 40].forEach((ax) => { if (!armXs.some((v) => Math.abs(v - ax) < 1)) armXs.push(ax); });
            });
            const arms = new THREE.InstancedMesh(armGeo, armMat, armXs.length);
            row.seats.forEach((s, i) => {
                const mats = [[44, 3], [40, -28]].map((p) => {
                    o.position.set(s.x, row.y + p[0], row.z + p[1]);
                    o.updateMatrix();
                    return o.matrix.clone();
                });
                backs.setMatrixAt(i, mats[0]);
                cush.setMatrixAt(i, mats[1]);
                seatIndex[s.code] = { group: g, meshes: [backs, cush], i: i, mats: mats };
            });
            armXs.forEach((ax, i) => {
                o.position.set(ax, row.y + 29, row.z - 24);
                o.updateMatrix();
                arms.setMatrixAt(i, o.matrix);
            });
            g.add(backs, cush, arms);
            hall.add(g);
            rowGroups.push(g);
        });

        // màn nhung hai bên màn chiếu: nếp gấp là mặt phẳng uốn lượn sóng
        const curtainMat = mat('velvet', 170, H.screenH + 220, 90, 0x94585b, 0.8);
        curtainMat.side = THREE.DoubleSide;
        [-1, 1].forEach((side) => {
            const g = new THREE.PlaneGeometry(170, H.screenH + 220, 40, 1);
            const pos = g.attributes.position;
            for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) / 22 * Math.PI) * 7);
            g.computeVertexNormals();
            add(g, curtainMat, side * (H.screenW / 2 + 95), -(H.screenCY - 40), H.screenZ + 60);
        });

        Object.keys(mine).forEach((code) => setSeat(code, true));
        if (!screen) buildScreen(H);
        rowGroups.forEach((g, r) => { g.visible = rowsShown[r] !== false; });
    }

    // Màn chiếu: viền đen, mặt màn trắng mờ (đèn rạp chiếu vào thì xám sáng) và lớp video cong theo cùng mặt trụ.
    function buildScreen(H) {
        const W = H.screenW;
        const Hh = H.screenH;
        const group = new THREE.Group();
        group.position.set(0, -H.screenCY, H.screenZ);
        const frame = new THREE.Mesh(curved(W + 30, Hh + 30, SCREEN_R + 2), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        frame.position.z = -2;
        const blankMat = new THREE.MeshStandardMaterial({ color: 0xb9b4b0, roughness: 1, metalness: 0 });
        const blank = new THREE.Mesh(curved(W, Hh, SCREEN_R), blankMat);
        const videoMat = new THREE.MeshBasicMaterial({ toneMapped: false });
        const videoMesh = new THREE.Mesh(curved(W, Hh, SCREEN_R), videoMat);
        videoMesh.position.z = 0.6;
        videoMesh.visible = false;
        group.add(frame, blank, videoMesh);
        scene.add(group);
        screenLight.width = W;
        screenLight.height = Hh;
        screenLight.position.set(0, -H.screenCY, H.screenZ + 60);
        screenLight.lookAt(0, 300, H.backZ);
        screen = { group: group, blankMat: blankMat, videoMat: videoMat, videoMesh: videoMesh, W: W, H: Hh };
        fitVideo();
    }

    // ---------- video trên màn chiếu ----------
    let videoEl = null;
    let videoTex = null;

    // Giữ đúng tỉ lệ khung hình của phim, phần thừa là màn tối (như rạp chiếu phim 2.39:1 trên màn 16:9).
    function fitVideo() {
        if (!screen) return;
        const v = videoEl;
        const a = v && v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : screen.W / screen.H;
        const w = a >= screen.W / screen.H ? screen.W : screen.H * a;
        const h = a >= screen.W / screen.H ? screen.W / a : screen.H;
        screen.videoMesh.geometry.dispose();
        screen.videoMesh.geometry = curved(w, h, SCREEN_R - 0.6);
    }

    function setVideo(v) {
        if (v === videoEl) return;
        if (videoEl) videoEl.removeEventListener('resize', fitVideo);
        if (videoTex) { videoTex.dispose(); videoTex = null; }
        videoEl = v || null;
        if (videoEl) {
            videoTex = new THREE.VideoTexture(videoEl);
            videoTex.colorSpace = THREE.SRGBColorSpace;
            videoEl.addEventListener('resize', fitVideo);
        }
        if (screen) {
            screen.videoMat.map = videoTex;
            screen.videoMat.needsUpdate = true;
            screen.videoMesh.visible = !!videoTex;
            fitVideo();
        }
    }

    // ---------- ghế của mình, hàng bị ẩn ----------
    // Ghế của mình: ẩn lưng + đệm nhung ở chỗ đó và đặt cặp màu xanh chanh vào. Chỉ có một ghế của mình.
    function setSeat(code, isMine) {
        if (isMine) mine[code] = true;
        else delete mine[code];
        if (isMine === (mineAt === code)) return;
        if (mineAt) swapSeat(mineAt, false);
        if (isMine) swapSeat(code, true);
    }

    function swapSeat(code, isMine) {
        const s = seatIndex[code];
        mineAt = isMine && s ? code : null;
        if (!s) return;
        s.meshes.forEach((m, k) => {
            m.setMatrixAt(s.i, isMine ? HIDDEN : s.mats[k]);
            m.instanceMatrix.needsUpdate = true;
        });
        mineMeshes.forEach((m, k) => {
            if (!isMine) { s.group.remove(m); return; }
            m.matrix.copy(s.mats[k]);
            m.matrixWorldNeedsUpdate = true;
            s.group.add(m);
        });
    }

    let rowsShown = [];
    function setRows(shown) {
        rowsShown = shown.slice();
        rowGroups.forEach((g, r) => { g.visible = shown[r] !== false; });
    }

    // ---------- camera theo transform CSS ----------
    const F = new THREE.Matrix4().makeScale(1, -1, 1);
    const M = new THREE.Matrix4();
    const T = new THREE.Matrix4();
    const V = new THREE.Matrix4();
    let sizeW = 0;
    let sizeH = 0;
    let lastP = 0;

    function syncCamera() {
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        if (!w || !h) return false;
        const P = parseFloat(stage.style.perspective);
        if (!(P > 0) || !cssMatrix(getComputedStyle(world).transform, M)) return false;
        if (w !== sizeW || h !== sizeH) {
            sizeW = w;
            sizeH = h;
            renderer.setSize(w, h, false);
            lastP = 0;
        }
        if (P !== lastP) {
            // perspective P của CSS ứng với góc nhìn dọc 2·atan(h/2 / P)
            lastP = P;
            camera.fov = 2 * Math.atan(h / 2 / P) * 180 / Math.PI;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        }
        // CSS: điểm p (y hướng xuống) -> M·p, người xem ở z = P. Sang Three: lật y hai đầu, dời gốc về mắt.
        V.copy(F).multiply(T.makeTranslation(0, 0, -P)).multiply(M).multiply(F);
        camera.matrix.copy(V).invert();
        camera.updateMatrixWorld(true);
        return true;
    }

    // ---------- vòng vẽ ----------
    let level = 1;                // đèn rạp: 0 tắt, 1 sáng hẳn
    let glow = 0;                 // độ sáng hắt ra từ màn chiếu
    let dim = 1;                  // video mờ đi khi hết phim
    let blankGrey = 0.72;
    let raf = 0;
    let last = 0;
    const probe = { frames: 0, time: 0, done: false };

    function update(dt) {
        const cl = root.classList;
        const k = 1 - Math.exp(-dt / LIGHT_TAU);
        const target = cl.contains('lights-on') ? 1 : cl.contains('lights-half') ? 0.45 : 0;
        level += (target - level) * k;
        hemi.intensity = 0.05 + 0.85 * level;
        spots.forEach((s) => { s.intensity = 1.6 * level; });
        if (live.sconce) live.sconce.emissiveIntensity = 0.08 + 1.4 * level;
        if (live.down) live.down.emissiveIntensity = 0.05 + 1.8 * level;

        const media = cl.contains('has-media');
        const ended = cl.contains('is-ended');
        glow += ((videoTex ? 3 : media ? 0.8 : 0) * (ended ? 0.3 : 1) - glow) * k;
        screenLight.intensity = glow;
        dim += ((ended ? 0.22 : 1) - dim) * k;
        blankGrey += ((media ? 0.02 : 0.72) - blankGrey) * k;
        if (screen) {
            screen.videoMat.color.setScalar(dim);
            screen.blankMat.color.setScalar(blankGrey);
        }
    }

    function frame(t) {
        raf = requestAnimationFrame(frame);
        const dt = last ? Math.min(0.25, (t - last) / 1000) : 0.016;
        last = t;
        if (!syncCamera()) return;
        update(dt);
        renderer.render(scene, camera);
        // Đo tốc độ một lần sau khi đã chạy ổn định: dưới ~22 hình/giây thì nhờ cinema.js quay về rạp CSS-3D.
        if (!probe.done && dt < 0.25) {
            probe.frames++;
            if (probe.frames > 30) probe.time += dt;
            if (probe.frames > 150) {
                probe.done = true;
                if (120 / probe.time < 22) fail('slow');
            }
        }
    }

    function setActive(on) {
        if (on && !raf) {
            last = 0;
            raf = requestAnimationFrame(frame);
        } else if (!on && raf) {
            cancelAnimationFrame(raf);
            raf = 0;
        }
    }

    function fail(why) {
        if (opts && opts.onFail) opts.onFail(why);
    }

    function dispose() {
        setActive(false);
        setVideo(null);
        clearHall();
        renderer.dispose();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }

    return { build: build, setSeat: setSeat, setRows: setRows, setVideo: setVideo, setActive: setActive, dispose: dispose };
}
