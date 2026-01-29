"""
Auto-download Vietnamese dataset for RVC training
Uses VIVOS dataset from OpenSLR (FREE, public domain)
"""

import os
import urllib.request
import tarfile
import shutil
from pathlib import Path

# Dataset URLs
DATASETS = {
    "vivos": {
        "name": "VIVOS Vietnamese Speech",
        "url": "https://www.openslr.org/resources/104/vivos.tar.gz",
        "size": "~2GB",
        "duration": "15 hours",
        "description": "Clean Vietnamese speech corpus"
    },
    "common_voice": {
        "name": "Common Voice Vietnamese",
        "url": "https://commonvoice.mozilla.org/vi/datasets",
        "size": "~5GB",
        "duration": "100+ hours",
        "description": "Community-contributed Vietnamese speech (requires login)"
    }
}

def download_file(url, filename):
    """Download file with progress"""
    print(f"📥 Downloading: {filename}")
    print(f"   From: {url}")
    
    def progress(block_num, block_size, total_size):
        downloaded = block_num * block_size
        percent = (downloaded / total_size) * 100 if total_size > 0 else 0
        print(f"\r   Progress: {percent:.1f}% ({downloaded / 1024 / 1024:.1f} MB)", end='')
    
    try:
        urllib.request.urlretrieve(url, filename, progress)
        print("\n✅ Download complete!")
        return True
    except Exception as e:
        print(f"\n❌ Download failed: {e}")
        return False

def extract_tar_gz(filename, output_dir):
    """Extract tar.gz file"""
    print(f"📦 Extracting: {filename}")
    try:
        with tarfile.open(filename, 'r:gz') as tar:
            tar.extractall(output_dir)
        print("✅ Extraction complete!")
        return True
    except Exception as e:
        print(f"❌ Extraction failed: {e}")
        return False

def prepare_dataset(dataset_name="vivos"):
    """Download and prepare dataset"""
    
    if dataset_name not in DATASETS:
        print(f"❌ Unknown dataset: {dataset_name}")
        print(f"   Available: {', '.join(DATASETS.keys())}")
        return False
    
    dataset_info = DATASETS[dataset_name]
    
    print("=" * 60)
    print(f"📊 Dataset: {dataset_info['name']}")
    print(f"   Size: {dataset_info['size']}")
    print(f"   Duration: {dataset_info['duration']}")
    print(f"   Description: {dataset_info['description']}")
    print("=" * 60)
    print()
    
    # Create directories
    download_dir = Path("downloads")
    dataset_dir = Path("dataset/raw")
    download_dir.mkdir(parents=True, exist_ok=True)
    dataset_dir.mkdir(parents=True, exist_ok=True)
    
    # Download
    if dataset_name == "vivos":
        filename = download_dir / "vivos.tar.gz"
        
        if not filename.exists():
            success = download_file(dataset_info['url'], str(filename))
            if not success:
                return False
        else:
            print(f"✅ Already downloaded: {filename}")
        
        # Extract
        extract_dir = download_dir / "vivos"
        if not extract_dir.exists():
            success = extract_tar_gz(str(filename), str(download_dir))
            if not success:
                return False
        else:
            print(f"✅ Already extracted: {extract_dir}")
        
        # Copy audio files to dataset folder
        print("\n📁 Organizing dataset...")
        train_dir = extract_dir / "vivos" / "train"
        test_dir = extract_dir / "vivos" / "test"
        
        file_count = 0
        for audio_dir in [train_dir, test_dir]:
            if audio_dir.exists():
                for wav_file in audio_dir.rglob("*.wav"):
                    dest = dataset_dir / f"vivos_{file_count:04d}.wav"
                    if not dest.exists():
                        shutil.copy(wav_file, dest)
                    file_count += 1
                    if file_count % 100 == 0:
                        print(f"   Copied {file_count} files...")
        
        print(f"\n✅ Dataset ready: {file_count} audio files")
        print(f"   Location: {dataset_dir}")
        
        # Calculate total duration (approximate)
        total_duration = file_count * 3  # ~3 seconds per file
        print(f"   Total duration: ~{total_duration / 60:.0f} minutes")
        
        return True
    
    elif dataset_name == "common_voice":
        print("\n⚠️  Common Voice requires manual download:")
        print(f"   1. Visit: {dataset_info['url']}")
        print(f"   2. Sign in (FREE account)")
        print(f"   3. Download Vietnamese dataset")
        print(f"   4. Extract to: {dataset_dir}")
        return False

def select_subset(max_duration_minutes=20):
    """Select subset of dataset for faster training"""
    dataset_dir = Path("dataset/raw")
    subset_dir = Path("dataset/subset")
    subset_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"\n📊 Creating {max_duration_minutes}-minute subset...")
    
    import librosa
    
    files = list(dataset_dir.glob("*.wav"))
    total_duration = 0
    selected_count = 0
    
    for audio_file in files:
        if total_duration >= max_duration_minutes * 60:
            break
        
        try:
            duration = librosa.get_duration(path=str(audio_file))
            dest = subset_dir / audio_file.name
            shutil.copy(audio_file, dest)
            total_duration += duration
            selected_count += 1
            
            if selected_count % 10 == 0:
                print(f"   Selected {selected_count} files, {total_duration / 60:.1f} mins")
        except:
            continue
    
    print(f"\n✅ Subset created: {selected_count} files")
    print(f"   Duration: {total_duration / 60:.1f} minutes")
    print(f"   Location: {subset_dir}")
    
    return True

if __name__ == "__main__":
    print("\n" + "🎤" * 30)
    print("  VIETNAMESE DATASET DOWNLOADER")
    print("🎤" * 30 + "\n")
    
    print("Available datasets:")
    for key, info in DATASETS.items():
        print(f"  {key}: {info['name']} ({info['size']})")
    print()
    
    # Download VIVOS (automatic)
    print("📥 Downloading VIVOS dataset (recommended)...")
    print("   This will take 10-20 minutes depending on connection")
    print()
    
    success = prepare_dataset("vivos")
    
    if success:
        # Create subset for faster training
        print("\n" + "=" * 60)
        create_subset = input("Create 20-minute subset for faster training? (y/n): ")
        if create_subset.lower() == 'y':
            select_subset(20)
        
        print("\n" + "=" * 60)
        print("✅ DATASET READY!")
        print("\nNext steps:")
        print("  1. Dataset location: dataset/raw/")
        print("  2. Upload to Colab or use locally")
        print("  3. Start training!")
        print("=" * 60)
    else:
        print("\n⚠️  Automatic download failed")
        print("   Please download manually from links above")
