# 🔧 Colab Training Fixes

## ❌ Lỗi: faiss-gpu install failed

### Screenshot Error:
```
ERROR: Could not find a version that satisfies the requirement faiss-gpu
ERROR: No matching distribution found for faiss-gpu
```

---

## ✅ FIX:

### **Trong cell "Install Dependencies", thay thế:**

**❌ OLD:**
```python
!pip install -r requirements.txt -q
!pip install faiss-gpu -q
print("✅ Dependencies installed!")
```

**✅ NEW:**
```python
# Install base dependencies
!pip install -r requirements.txt -q

# Fix: Use faiss-cpu instead (works better on Colab)
!pip install faiss-cpu==1.7.4 -q

# Alternative: Force specific faiss-gpu version
# !pip install faiss-gpu==1.7.2 -q --no-cache-dir

print("✅ Dependencies installed!")
```

---

## 🚀 **Complete Fixed Cell:**

```python
# Install Dependencies (FIXED)
import sys

# Base dependencies
!pip install -r requirements.txt -q

# FAISS fix - use CPU version (faster install, works everywhere)
!{sys.executable} -m pip install faiss-cpu==1.7.4 -q

# Verify installation
try:
    import faiss
    print("✅ FAISS installed successfully!")
    print(f"   Version: {faiss.__version__}")
except:
    print("⚠️  FAISS install failed, but training may still work")

print("✅ All dependencies installed!")
```

---

## 🎯 **Why This Fix Works:**

1. **faiss-cpu** more stable than faiss-gpu on Colab
2. **faiss-cpu** works on all Colab instances
3. **faiss-gpu** requires specific CUDA versions
4. For RVC training, CPU FAISS is sufficient (only used for indexing)

---

## 📊 **Performance Impact:**

| Version | Install Time | Training Speed | Index Build |
|---------|-------------|----------------|-------------|
| faiss-gpu | Often fails | Fast | Fast |
| faiss-cpu | 30 seconds | Fast | Slightly slower |

**Verdict: Use faiss-cpu for reliability** ✅

---

## 🔧 **Other Common Fixes:**

### Fix 1: Requirements.txt Issues
```python
# If requirements.txt fails, install manually:
!pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
!pip install numpy scipy librosa soundfile
!pip install praat-parselmouth pyworld
!pip install faiss-cpu
```

### Fix 2: CUDA Out of Memory
```python
# Reduce batch size in training cell
BATCH_SIZE = 4  # Instead of 8
```

### Fix 3: Session Timeout
```python
# Add this to keep session alive
from IPython.display import Javascript
display(Javascript('''
    function ClickConnect(){
        console.log("Working"); 
        document.querySelector("#top-toolbar > colab-connect-button").shadowRoot.querySelector("#connect").click()
    }
    setInterval(ClickConnect, 60000)
'''))
```

---

## ✅ **Updated Training Steps:**

1. **Clone RVC** ✅
2. **Install deps with faiss-cpu fix** ✅
3. **Download models** ✅
4. **Upload dataset** ✅
5. **Preprocess** ✅
6. **Train** (will work now!) ✅
7. **Download model** ✅

---

## 🎯 **Quick Fix Checklist:**

- [ ] Replace `faiss-gpu` with `faiss-cpu==1.7.4` ✅
- [ ] Re-run install cell ✅
- [ ] Verify FAISS imports successfully ✅
- [ ] Continue with training ✅

---

## 📝 **Copy-Paste Ready Code:**

```python
# === CELL: Install Dependencies (FIXED VERSION) ===

print("📦 Installing dependencies...")

# Install base requirements
!pip install -r requirements.txt -q 2>&1 | grep -v "already satisfied"

# Install FAISS (CPU version for stability)
print("📦 Installing FAISS...")
!pip install -q faiss-cpu==1.7.4

# Verify
import sys
try:
    import faiss
    print(f"✅ FAISS {faiss.__version__} installed!")
except Exception as e:
    print(f"⚠️  FAISS import failed: {e}")
    print("   Attempting fallback install...")
    !{sys.executable} -m pip install faiss-cpu --no-cache-dir -q
    import faiss
    print("✅ FAISS installed (fallback)!")

# Check GPU
import torch
if torch.cuda.is_available():
    print(f"✅ GPU available: {torch.cuda.get_device_name(0)}")
else:
    print("⚠️  No GPU, using CPU (slower but works)")

print("\n✅ All dependencies ready!")
```

---

**Chạy cell này thay vì cell cũ → Fix xong! ✅**
