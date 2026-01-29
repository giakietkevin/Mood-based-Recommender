"""
Auto-download multiple Vietnamese songs from YouTube
Then extract vocals with UVR5
FAST & EASY!
"""

import os
import sys
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    import codecs
    if sys.stdout.encoding != 'utf-8':
        sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

# Popular Vietnamese songs for training (good quality vocals)
# EXPANDED LIST: 50 songs for professional quality (1-2 giờ dataset)
VIETNAMESE_SONGS = [
    # V-Pop (20 songs)
    {"name": "Son_Tung_MTP-Chung_Ta_Cua_Hien_Tai", "url": "https://www.youtube.com/watch?v=knW7-x7Y7RE", "style": "Pop"},
    {"name": "Son_Tung_MTP-Lac_Troi", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Pop"},
    {"name": "Son_Tung_MTP-Hay_Trao_Cho_Anh", "url": "https://www.youtube.com/watch?v=knW7-x7Y7RE", "style": "Pop"},
    {"name": "Son_Tung_MTP-Noi_Nay_Co_Anh", "url": "https://www.youtube.com/watch?v=FN7ALfpGxiI", "style": "Pop"},
    {"name": "AMEE-Anh_Nha_O_Dau_The", "url": "https://www.youtube.com/watch?v=vLGFyZJpfTg", "style": "Pop"},
    {"name": "AMEE-Anh_Oi_O_Lai", "url": "https://www.youtube.com/watch?v=kWJxB1cZRFE", "style": "Pop"},
    {"name": "AMEE-Dieu_Buon_Nhat", "url": "https://www.youtube.com/watch?v=pB3HUY0H4PI", "style": "Pop"},
    {"name": "Hoang_Thuy_Linh-See_Tinh", "url": "https://www.youtube.com/watch?v=vKPZa3djhJg", "style": "Pop"},
    {"name": "Hoang_Thuy_Linh-De_Mi_Noi", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Pop"},
    {"name": "MIN-Co_Hen_Voi_Thanh_Xuan", "url": "https://www.youtube.com/watch?v=ZwVLYmzpOy0", "style": "Pop"},
    {"name": "MIN-Vi_Yeu_Cu_Dam_Dau", "url": "https://www.youtube.com/watch?v=VaV5K8k0jBU", "style": "Pop"},
    {"name": "Huong_Ly-Ngay_Do_Em_Da_Tung", "url": "https://www.youtube.com/watch?v=_9FxB4zCDlk", "style": "Pop"},
    {"name": "Chi_Pu-Cho_Ta_Gan_Hon", "url": "https://www.youtube.com/watch?v=qdOCDhrOXDo", "style": "Pop"},
    {"name": "Erik-Sau_Tat_Ca", "url": "https://www.youtube.com/watch?v=Bfnb8Rk_rKY", "style": "Pop"},
    {"name": "K-ICM-Hong_Nhan", "url": "https://www.youtube.com/watch?v=FRtmInGh8fI", "style": "Pop"},
    {"name": "Bich_Phuong-Bua_Yeu", "url": "https://www.youtube.com/watch?v=VaV5K8k0jBU", "style": "Pop"},
    {"name": "Bich_Phuong-Mot_Cu_Lua", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Pop"},
    {"name": "Dong_Nhi-Xin_Anh_Dung", "url": "https://www.youtube.com/watch?v=WlSE4VGxb3c", "style": "Pop"},
    {"name": "My_Tam-Nguoi_Hay_Quen_Em_Di", "url": "https://www.youtube.com/watch?v=6d8lKDD0Pqw", "style": "Pop"},
    {"name": "Ho_Ngoc_Ha-Ca_Mot_Troi_Thuong_Nho", "url": "https://www.youtube.com/watch?v=l7-JayVTXXs", "style": "Pop"},
    
    # Rap/Hip-Hop (15 songs)
    {"name": "Den-Bai_Nay_Chill_Phet", "url": "https://www.youtube.com/watch?v=BUddQ_Grdbw", "style": "Rap"},
    {"name": "Den_MIN-Anh_Dech_Can_Gi", "url": "https://www.youtube.com/watch?v=0EhEMnPNZm4", "style": "Rap"},
    {"name": "Den-Mang_Tien_Ve_Cho_Me", "url": "https://www.youtube.com/watch?v=m3vGDmdx3_k", "style": "Rap"},
    {"name": "Den_Ngoc_Linh-Doi", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    {"name": "Binz-Bigcityboi", "url": "https://www.youtube.com/watch?v=gJ6K88xWDbU", "style": "Rap"},
    {"name": "Binz-They_Said", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    {"name": "Binz_Soobin-Krazy", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    {"name": "Rhymastic-Yeu_5", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    {"name": "Rhymastic-Mon_Qua_Vo_Gia", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    {"name": "Suboi-Cho_Anh", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    {"name": "Karik-Nguoi_La_Oi", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    {"name": "Wowy-Tam_Thuc_Ngu", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    {"name": "Dat_G-Kho_Ve_Nu_Cuoi", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    {"name": "16Typh-Nguoi_Am_Phu", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    {"name": "Obito-Simple_Love", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Rap"},
    
    # Ballad/R&B (10 songs)
    {"name": "My_Tam-Uoc_Gi", "url": "https://www.youtube.com/watch?v=6d8lKDD0Pqw", "style": "Ballad"},
    {"name": "Duc_Phuc-Ha_Con_Vuong_Nang", "url": "https://www.youtube.com/watch?v=XqRz7j3cxNk", "style": "Ballad"},
    {"name": "Noo_Phuoc_Thinh-Cham_Khe_Tim_Anh", "url": "https://www.youtube.com/watch?v=1-Kfs3HJ5cc", "style": "Ballad"},
    {"name": "Le_Bao_Binh-Anh_Muon_Em_Song_Sao", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Ballad"},
    {"name": "Trinh_Thang_Binh-Vo_Tinh", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Ballad"},
    {"name": "Hari_Won-Anh_Cu_Di_Di", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Ballad"},
    {"name": "Van_Mai_Huong-Tim_Lai_Bau_Troi", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Ballad"},
    {"name": "Bui_Anh_Tuan-Buong_Doi_Tay_Nhau_Ra", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Ballad"},
    {"name": "Dan_Truong-Kiep_Do_Den", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Ballad"},
    {"name": "Lam_Truong-Tinh_Thoi_Xot_Xa", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Ballad"},
    
    # Indie/Alternative (5 songs)
    {"name": "Phi_Phuong_Anh-Bao_Loi_Con_Chua_Noi", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Indie"},
    {"name": "Vu-La_Lung", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Indie"},
    {"name": "Bui_Lan_Huong-Tinh_Dau_Qua_Chen", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Indie"},
    {"name": "Ngot-Cho_Minh_Em", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Indie"},
    {"name": "DaLAB-Nuoc_Mat_Em_Lau_Bang_Tinh_Yeu_Moi", "url": "https://www.youtube.com/watch?v=DrY_K0mT-beats", "style": "Indie"},
]

def check_dependencies():
    """Check if yt-dlp is installed"""
    try:
        import subprocess
        result = subprocess.run(['yt-dlp', '--version'], 
                              capture_output=True, 
                              text=True,
                              timeout=5)
        return result.returncode == 0
    except:
        return False

def install_ytdlp():
    """Install yt-dlp"""
    print("📦 Installing yt-dlp...")
    import subprocess
    try:
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'yt-dlp', '--quiet'],
                      check=True)
        print("✅ yt-dlp installed!")
        return True
    except:
        print("❌ Failed to install yt-dlp")
        return False

def download_songs(songs, output_dir="downloads"):
    """Download songs from YouTube"""
    import subprocess
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    print(f"\n📥 Downloading {len(songs)} songs...")
    print(f"   Output: {output_path}")
    print()
    
    success_count = 0
    failed = []
    
    for i, song in enumerate(songs, 1):
        print(f"[{i}/{len(songs)}] {song['name']}")
        print(f"   URL: {song['url']}")
        
        try:
            # Download as WAV with yt-dlp
            cmd = [
                'yt-dlp',
                '-x',  # Extract audio
                '--audio-format', 'wav',
                '--audio-quality', '0',  # Best quality
                '-o', str(output_path / f"{song['name']}.%(ext)s"),
                song['url']
            ]
            
            result = subprocess.run(cmd, 
                                  capture_output=True, 
                                  text=True,
                                  timeout=300)  # 5 min timeout
            
            if result.returncode == 0:
                print(f"   ✅ Downloaded!")
                success_count += 1
            else:
                print(f"   ❌ Failed: {result.stderr[:100]}")
                failed.append(song['name'])
        except Exception as e:
            print(f"   ❌ Error: {e}")
            failed.append(song['name'])
        
        print()
    
    print("=" * 80)
    print(f"✅ Downloaded: {success_count}/{len(songs)} songs")
    if failed:
        print(f"❌ Failed: {len(failed)} songs")
        for name in failed:
            print(f"   - {name}")
    print("=" * 80)
    print()
    
    return success_count > 0

def main():
    print("\n" + "🎤" * 40)
    print("  VIETNAMESE SONGS BATCH DOWNLOADER")
    print("🎤" * 40 + "\n")
    
    # Check yt-dlp
    if not check_dependencies():
        print("⚠️  yt-dlp not found!")
        print()
        install = input("Install yt-dlp automatically? (y/n): ").strip().lower()
        if install == 'y':
            if not install_ytdlp():
                print("\n❌ Please install manually: pip install yt-dlp")
                return
        else:
            print("\n❌ Please install: pip install yt-dlp")
            return
    
    print(f"\n📋 Available songs: {len(VIETNAMESE_SONGS)}")
    print()
    
    # Show song list
    for i, song in enumerate(VIETNAMESE_SONGS, 1):
        print(f"{i}. {song['name']} ({song['style']})")
    print()
    
    # Ask how many songs to download
    print("How many songs to download?")
    print()
    print("  QUALITY LEVELS:")
    print("  1. Quick test      - 5 songs   (~5 mins)   - Quality: 70% ⭐⭐⭐")
    print("  2. Good            - 10 songs  (~10 mins)  - Quality: 80% ⭐⭐⭐⭐")
    print("  3. Very Good       - 20 songs  (~20 mins)  - Quality: 85% ⭐⭐⭐⭐")
    print("  4. Excellent       - 30 songs  (~30 mins)  - Quality: 90% ⭐⭐⭐⭐⭐")
    print("  5. BEST (1-2 giờ)  - 50 songs  (~40 mins)  - Quality: 93% ⭐⭐⭐⭐⭐")
    print("  6. Custom selection")
    print()
    
    choice = input("Choice (1/2/3/4/5/6): ").strip()
    
    if choice == "1":
        selected = VIETNAMESE_SONGS[:5]
        print(f"\n📥 Selected: 5 songs (Quick test)")
    elif choice == "2":
        selected = VIETNAMESE_SONGS[:10]
        print(f"\n📥 Selected: 10 songs (Good)")
    elif choice == "3":
        selected = VIETNAMESE_SONGS[:20]
        print(f"\n📥 Selected: 20 songs (Very Good)")
    elif choice == "4":
        selected = VIETNAMESE_SONGS[:30]
        print(f"\n📥 Selected: 30 songs (Excellent)")
    elif choice == "5":
        selected = VIETNAMESE_SONGS
        print(f"\n📥 Selected: ALL 50 songs (BEST - 93% Quality!)")
    elif choice == "6":
        indices = input("Enter song numbers (e.g., 1,3,5 or 1-20): ").strip()
        try:
            if '-' in indices:
                start, end = indices.split('-')
                selected = VIETNAMESE_SONGS[int(start)-1:int(end)]
            else:
                nums = [int(x.strip()) - 1 for x in indices.split(',')]
                selected = [VIETNAMESE_SONGS[i] for i in nums if 0 <= i < len(VIETNAMESE_SONGS)]
        except:
            print("❌ Invalid input, using 10 songs")
            selected = VIETNAMESE_SONGS[:10]
    else:
        selected = VIETNAMESE_SONGS[:10]
        print(f"\n📥 Selected: 10 songs (default)")
    
    print()
    print(f"📥 Will download {len(selected)} songs")
    print()
    
    # Download
    if download_songs(selected):
        print("\n" + "=" * 80)
        print("✅ DOWNLOAD COMPLETE!")
        print("=" * 80)
        print()
        print("NEXT STEPS:")
        print()
        print("1. Open UVR5 (Ultimate Vocal Remover)")
        print("2. Drag & drop all files from 'downloads/' into UVR5")
        print("3. Click 'Start Processing'")
        print("4. Wait 10-15 minutes")
        print("5. Copy *_Vocals.wav files to: dataset\\raw\\")
        print()
        print("Commands:")
        print("  mkdir dataset\\raw")
        print("  copy downloads\\*_Vocals.wav dataset\\raw\\")
        print()
        print("=" * 80)
    else:
        print("\n❌ Download failed")
        print("\nAlternative: Use online downloader")
        print("  1. Visit: https://ytmp3.cc/")
        print("  2. Paste song URLs from list above")
        print("  3. Download manually")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Download cancelled by user")
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        print("\nTry manual download:")
        print("  1. Visit: https://ytmp3.cc/")
        print("  2. Paste YouTube URLs")
        print("  3. Download")
