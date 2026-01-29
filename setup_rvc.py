"""
Auto-download RVC models and dependencies
Run this once to setup RVC singing voice
"""

import os
import sys
import requests
from pathlib import Path
import zipfile
import tarfile
from tqdm import tqdm

# Model URLs (using Hugging Face for reliability)
MODEL_URLS = {
    "hubert_base": {
        "url": "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/hubert_base.pt",
        "path": "models/rvc/hubert_base.pt",
        "size": "189MB"
    },
    "rmvpe": {
        "url": "https://huggingface.co/lj1995/VoiceConversionWebUI/resolve/main/rmvpe.pt", 
        "path": "models/rvc/rmvpe.pt",
        "size": "70MB"
    },
    # Pre-trained Vietnamese voice models (if available)
    # Otherwise will use fallback
}

def download_file(url, save_path, desc="Downloading"):
    """Download file with progress bar"""
    save_path = Path(save_path)
    save_path.parent.mkdir(parents=True, exist_ok=True)
    
    if save_path.exists():
        print(f"✅ Already exists: {save_path}")
        return True
    
    try:
        print(f"📥 {desc}: {save_path.name}")
        
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        
        total_size = int(response.headers.get('content-length', 0))
        
        with open(save_path, 'wb') as f:
            if total_size > 0:
                with tqdm(total=total_size, unit='B', unit_scale=True) as pbar:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            pbar.update(len(chunk))
            else:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
        
        print(f"✅ Downloaded: {save_path}")
        return True
        
    except Exception as e:
        print(f"❌ Download failed: {e}")
        if save_path.exists():
            save_path.unlink()
        return False

def setup_rvc_models():
    """Download all required RVC models"""
    print("=" * 60)
    print("🎤 RVC Singing Voice Setup")
    print("=" * 60)
    print()
    
    # Create models directory
    models_dir = Path("models/rvc")
    models_dir.mkdir(parents=True, exist_ok=True)
    
    print("📦 Downloading RVC models...")
    print("⚠️  This may take 5-10 minutes depending on your connection")
    print()
    
    success_count = 0
    total_count = len(MODEL_URLS)
    
    for model_name, info in MODEL_URLS.items():
        print(f"\n[{success_count + 1}/{total_count}] {model_name} ({info['size']})")
        
        if download_file(info['url'], info['path'], f"Downloading {model_name}"):
            success_count += 1
    
    print()
    print("=" * 60)
    
    if success_count == total_count:
        print("✅ All models downloaded successfully!")
        print()
        print("🎵 RVC Singing Voice is ready to use!")
        print()
        print("Next steps:")
        print("  1. Run: python main.py")
        print("  2. Generate music with singing voice")
        print("  3. Enjoy! 🎤")
    elif success_count > 0:
        print(f"⚠️  Downloaded {success_count}/{total_count} models")
        print("   Some models failed, but basic functionality will work")
        print("   Enhanced TTS fallback will be used")
    else:
        print("❌ No models downloaded")
        print("   Will use enhanced TTS fallback only")
    
    print("=" * 60)
    
    return success_count > 0

def check_dependencies():
    """Check if required dependencies are installed"""
    print("\n🔍 Checking dependencies...")
    
    required = {
        "librosa": "librosa",
        "soundfile": "soundfile", 
        "numpy": "numpy",
        "scipy": "scipy",
        "tqdm": "tqdm",
        "requests": "requests"
    }
    
    missing = []
    
    for name, package in required.items():
        try:
            __import__(package)
            print(f"  ✅ {name}")
        except ImportError:
            print(f"  ❌ {name} (missing)")
            missing.append(package)
    
    if missing:
        print(f"\n⚠️  Missing dependencies: {', '.join(missing)}")
        print(f"   Install with: pip install {' '.join(missing)}")
        return False
    
    print("✅ All dependencies installed")
    return True

def main():
    """Main setup function"""
    print("\n" + "🎤" * 30)
    print("  RVC SINGING VOICE SETUP")
    print("🎤" * 30 + "\n")
    
    # Check dependencies
    if not check_dependencies():
        print("\n❌ Please install missing dependencies first")
        print("   Run: pip install -r requirements.txt")
        sys.exit(1)
    
    # Download models
    print()
    success = setup_rvc_models()
    
    if success:
        print("\n✅ Setup complete!")
        print("\n🎵 You can now generate music with singing voice")
        return 0
    else:
        print("\n⚠️  Setup incomplete, but app will still work")
        print("   (Using enhanced TTS fallback)")
        return 1

if __name__ == "__main__":
    sys.exit(main())
