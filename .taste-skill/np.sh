#!/bin/bash
# usage: np.sh <podcast 0|1> <w> <h> <out>
cd /c/Mood-based-Recommender
python - "$1" <<'PY'
import sys
pod=sys.argv[1]=='1'
s=open('index.html',encoding='utf-8').read()
js="""setTimeout(function(){var m=document.getElementById('auth-modal');if(m)m.style.display='none';
%s
playTrack({title:'Ai Cũng Sẽ Ổn Thôi - Bài hát giữ nhịp cho một ngày dài',artist:'KietStation Radio',thumbnail:'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',link:'dQw4w9WgXcQ'},'youtube');
openNowPlaying();},1500);"""%("document.getElementById('type-podcast')&&document.getElementById('type-podcast').classList.add('bg-primary');" if pod else "")
s=s.replace('</body>','<script>window.addEventListener("load",function(){'+js+'})</script></body>',1)
open('_shot.html','w',encoding='utf-8').write(s)
PY
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=$2,$3 --virtual-time-budget=12000 --screenshot="C:/Mood-based-Recommender/.taste-skill/$4" "file:///C:/Mood-based-Recommender/_shot.html" >/dev/null 2>&1
rm -f _shot.html
