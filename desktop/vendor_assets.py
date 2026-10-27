"""Makes the desktop build's UI work without internet.

index.html pulls Tailwind, fonts, icons, hls.js, MediaPipe... from CDNs. This downloads them into the *build copy*
of the server (js/vendor, css/vendor: folders the backend already serves) and rewrites the copy's links.
The web project itself is not touched.

Usage: python vendor_assets.py <server dir of the desktop build>
"""
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

# Google Fonts only returns woff2 to a modern browser user agent
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

SCRIPTS = {
    "https://cdn.tailwindcss.com?plugins=forms,typography": "tailwindcss.js",
    "https://cdn.jsdelivr.net/npm/hls.js@latest": "hls.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/color-thief/2.3.0/color-thief.umd.js": "color-thief.umd.js",
    "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js": "camera_utils.js",
    "https://cdn.jsdelivr.net/npm/simple-peer@9.11.1/simplepeer.min.js": "simplepeer.min.js",
    "https://unpkg.com/lucide@latest": "lucide.js",
}

FONT_CSS = {
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap": "inter.css",
    "https://fonts.googleapis.com/icon?family=Material+Icons+Round": "material-icons-round.css",
    "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200": "material-symbols-outlined.css",
}

MEDIAPIPE_PKG = "@mediapipe/selfie_segmentation"
MEDIAPIPE_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def replace_once(text, old, new, where):
    if old not in text:
        raise SystemExit(f"vendor_assets: '{old}' not found in {where}; update vendor_assets.py to match")
    return text.replace(old, new)


def main(server):
    index_path = server / "index.html"
    html = index_path.read_text(encoding="utf-8")
    js_vendor = server / "js" / "vendor"
    css_vendor = server / "css" / "vendor"
    js_vendor.mkdir(parents=True, exist_ok=True)
    (css_vendor / "fonts").mkdir(parents=True, exist_ok=True)

    for url, name in SCRIPTS.items():
        print("  script", name)
        (js_vendor / name).write_bytes(fetch(url))
        html = replace_once(html, f'"{url}"', f'"js/vendor/{name}"', "index.html")

    for url, name in FONT_CSS.items():
        print("  font  ", name)
        css = fetch(url).decode("utf-8")

        def local_font(m):
            font_url = m.group(1)
            ext = Path(font_url.split("?")[0]).suffix or ".woff2"
            file = hashlib.sha1(font_url.encode()).hexdigest()[:16] + ext
            target = css_vendor / "fonts" / file
            if not target.exists():
                target.write_bytes(fetch(font_url))
            return f"url(fonts/{file})"

        css = re.sub(r"url\((https://[^)]+)\)", local_font, css)
        (css_vendor / name).write_text(css, encoding="utf-8")
        html = replace_once(html, f'"{url}"', f'"css/vendor/{name}"', "index.html")

    # MediaPipe: the loader script plus the wasm/model files it fetches at runtime, all from one pinned version
    version = json.loads(fetch(f"https://data.jsdelivr.com/v1/packages/npm/{MEDIAPIPE_PKG}/resolved"))["version"]
    listing = json.loads(fetch(f"https://data.jsdelivr.com/v1/packages/npm/{MEDIAPIPE_PKG}@{version}?structure=flat"))
    mp_dir = js_vendor / "selfie_segmentation"
    mp_dir.mkdir(exist_ok=True)
    for f in listing["files"]:
        name = f["name"].lstrip("/")
        if "/" in name or name.endswith((".md", ".json", ".d.ts")):
            continue
        print("  mediapipe", name)
        (mp_dir / name).write_bytes(fetch(f"https://cdn.jsdelivr.net/npm/{MEDIAPIPE_PKG}@{version}/{name}"))
    html = replace_once(html, f'"{MEDIAPIPE_CDN}selfie_segmentation.js"', '"js/vendor/selfie_segmentation/selfie_segmentation.js"', "index.html")

    app_js_path = server / "js" / "app.js"
    app_js = app_js_path.read_text(encoding="utf-8")
    app_js = replace_once(app_js, MEDIAPIPE_CDN + "${file}", "/js/vendor/selfie_segmentation/${file}", "js/app.js")
    app_js_path.write_text(app_js, encoding="utf-8")

    index_path.write_text(html, encoding="utf-8")
    print("  done")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    main(Path(sys.argv[1]))
