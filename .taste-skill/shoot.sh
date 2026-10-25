#!/bin/bash
# usage: shoot.sh <view> <width> <height> <out.png>
cd /c/Mood-based-Recommender
v=$1; w=$2; h=$3; out=$4
python - "$v" <<'PY'
import sys
v=sys.argv[1]
s=open('index.html',encoding='utf-8').read()
inj="<script>window.addEventListener('load',()=>setTimeout(()=>{var m=document.getElementById('auth-modal');if(m){m.classList.add('hidden');m.style.display='none'}try{showView('%s')}catch(e){}},1200))</script></body>"%v
s=s.replace('</body>',inj,1)
open('_shot.html','w',encoding='utf-8').write(s)
PY
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=$w,$h --virtual-time-budget=9000 --screenshot="C:/Mood-based-Recommender/.taste-skill/$out" "file:///C:/Mood-based-Recommender/_shot.html" >/dev/null 2>&1
rm -f _shot.html
