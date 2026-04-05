import re

content = open('index.html', encoding='utf-8').read()
lines = content.split('\n')
total = len(lines)

# find style blocks
styles = [(m.start(), m.end()) for m in re.finditer(r'<style[^>]*>.*?</style>', content, re.DOTALL)]
scripts = [(m.start(), m.end(), content[m.start():m.start()+100]) for m in re.finditer(r'<script[^>]*>.*?</script>', content, re.DOTALL)]

print(f'Total lines: {total}')
print(f'STYLE BLOCKS: {len(styles)}')
for s, e in styles:
    ln = content[:s].count('\n') + 1
    print(f'  line {ln}, len={e-s}')

print(f'\nSCRIPT BLOCKS: {len(scripts)}')
for idx, (s, e, preview) in enumerate(scripts):
    ln = content[:s].count('\n') + 1
    print(f'  [{idx}] line {ln}-{content[:e].count(chr(10))+1}, len={e-s}')
    print(f'       {repr(preview.strip()[:100])}')
