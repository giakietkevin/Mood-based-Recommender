import re

content = open('index.html', encoding='utf-8').read()
scripts = list(re.finditer(r'<script[^>]*>.*?</script>', content, re.DOTALL))

for idx, m in enumerate(scripts):
    ln_s = content[:m.start()].count('\n') + 1
    ln_e = content[:m.end()].count('\n') + 1
    inner = m.group()
    inner_stripped = inner.strip().replace('\r','')
    # show first 150 chars of content
    first_line = inner_stripped[:150].replace('\n',' ')
    print(f'[{idx:02d}] L{ln_s}-L{ln_e} ({ln_e-ln_s+1} lines): {first_line}')
