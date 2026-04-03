import base64
import os

profile_path = r'C:\Users\PC\.gemini\antigravity\brain\e7a994af-03b4-4e5b-93f1-31e42cbb8dba\kiet_profile_placeholder_1775189125137.png'
qr_path = r'C:\Users\PC\.gemini\antigravity\brain\e7a994af-03b4-4e5b-93f1-31e42cbb8dba\kiet_qr_placeholder_1775189151486.png'

with open(profile_path, 'rb') as f:
    profile_b64 = base64.b64encode(f.read()).decode()
    with open('kiet_profile_b64.txt', 'w') as out:
        out.write(profile_b64)

with open(qr_path, 'rb') as f:
    qr_b64 = base64.b64encode(f.read()).decode()
    with open('kiet_qr_b64.txt', 'w') as out:
        out.write(qr_b64)

print("Done")
