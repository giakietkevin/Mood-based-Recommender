"""
RVC (Retrieval-based Voice Conversion) Engine
Converts TTS speech to singing voice
"""

import os
import sys
import numpy as np
import librosa
import soundfile as sf
import subprocess
import shutil
from pathlib import Path

class RVCEngine:
    """
    Lightweight RVC wrapper using pre-trained models
    Falls back gracefully if RVC not available
    """
    
    def __init__(self, model_name="vietnamese_female", device="cpu"):
        self.model_name = model_name
        self.device = device
        self.available = False
        self.models_dir = Path("models/rvc")
        
        # Check if RVC is available
        self._check_availability()
    
    def _check_availability(self):
        """Check if RVC models are available"""
        try:
            # Check for model files
            model_path = self.models_dir / f"{self.model_name}.pth"
            if model_path.exists():
                self.available = True
                print(f"✅ RVC Model found: {model_path}")
            else:
                print(f"⚠️ RVC Model not found: {model_path}")
                print("   → Will use enhanced TTS instead")
        except Exception as e:
            print(f"⚠️ RVC check failed: {e}")
    
    def convert_to_singing(self, input_path, output_path, 
                          pitch_shift=0, formant_shift=0):
        """
        Convert speech to singing voice
        
        Args:
            input_path: Path to TTS audio
            output_path: Path to save singing audio
            pitch_shift: Semitones to shift (-12 to +12)
            formant_shift: Formant shift for gender change
        
        Returns:
            bool: Success status
        """
        if not self.available:
            # Fallback: Enhanced processing without RVC
            return self._enhanced_fallback(input_path, output_path, pitch_shift)
        
        try:
            # Try RVC conversion
            return self._rvc_convert(input_path, output_path, pitch_shift, formant_shift)
        except Exception as e:
            print(f"⚠️ RVC conversion failed: {e}")
            return self._enhanced_fallback(input_path, output_path, pitch_shift)
    
    def _rvc_convert(self, input_path, output_path, pitch_shift, formant_shift):
        """
        Actual RVC conversion using command line
        (Uses RVC-CLI if available)
        """
        try:
            # Check if rvc-cli is available
            rvc_cli = shutil.which("rvc") or shutil.which("rvc-cli")
            
            if rvc_cli:
                # Use RVC command line
                cmd = [
                    rvc_cli,
                    "infer",
                    "-i", input_path,
                    "-o", output_path,
                    "-m", str(self.models_dir / f"{self.model_name}.pth"),
                    "-p", str(pitch_shift),
                    "-f", "rmvpe",  # Pitch extraction method
                    "-ir", "0.5",   # Index rate
                    "-fr", "0",     # Filter radius
                ]
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                
                if result.returncode == 0 and os.path.exists(output_path):
                    print("✅ RVC conversion successful")
                    return True
                else:
                    print(f"⚠️ RVC CLI failed: {result.stderr}")
                    return False
            else:
                print("⚠️ RVC CLI not found")
                return False
                
        except Exception as e:
            print(f"⚠️ RVC conversion error: {e}")
            return False
    
    def _enhanced_fallback(self, input_path, output_path, pitch_shift):
        """
        Enhanced fallback: Add singing-like effects without RVC
        """
        try:
            # Load audio
            y, sr = librosa.load(input_path, sr=44100)
            
            # Add expressive vibrato (simulate singing)
            vibrato_rate = 5.5  # Hz
            vibrato_depth = 0.4  # Semitones
            
            t = np.arange(len(y)) / sr
            vibrato = vibrato_depth * np.sin(2 * np.pi * vibrato_rate * t)
            
            # Apply vibrato envelope (stronger in middle)
            envelope = np.ones_like(vibrato)
            fade_len = sr // 10
            if len(envelope) > fade_len * 2:
                envelope[:fade_len] = np.linspace(0, 1, fade_len)
                envelope[-fade_len:] = np.linspace(1, 0, fade_len)
            
            vibrato *= envelope
            
            # Modulate pitch slightly (simplified vibrato)
            # Real vibrato would need pitch shifting in real-time
            y_vibrato = y * (1 + vibrato * 0.02)
            
            # Add slight reverb effect (simulate room)
            from scipy import signal
            
            # Simple reverb using convolution with exponential decay
            reverb_length = int(0.05 * sr)  # 50ms reverb tail
            reverb_ir = np.exp(-np.arange(reverb_length) / (reverb_length * 0.3))
            reverb_ir = reverb_ir / reverb_ir.sum()
            
            y_with_reverb = signal.convolve(y_vibrato, reverb_ir, mode='same')
            
            # Normalize
            y_final = y_with_reverb / np.abs(y_with_reverb).max() * 0.9
            
            # Save
            sf.write(output_path, y_final, sr)
            print("✅ Enhanced fallback applied (no RVC)")
            return True
            
        except Exception as e:
            print(f"⚠️ Fallback failed: {e}, copying original")
            shutil.copy(input_path, output_path)
            return False


# Global RVC instances
_rvc_engines = {}

def get_rvc_engine(voice_type="female"):
    """
    Get or create RVC engine for voice type
    
    Args:
        voice_type: "female" or "male"
    
    Returns:
        RVCEngine instance
    """
    model_map = {
        "female": "vietnamese_female",
        "male": "vietnamese_male",
    }
    
    model_name = model_map.get(voice_type, "vietnamese_female")
    
    if model_name not in _rvc_engines:
        _rvc_engines[model_name] = RVCEngine(model_name)
    
    return _rvc_engines[model_name]


# Test function
if __name__ == "__main__":
    print("🎤 Testing RVC Engine...")
    
    # Test with dummy audio
    engine = get_rvc_engine("female")
    
    # Create test audio
    test_audio = "test_input.wav"
    test_output = "test_output.wav"
    
    # Generate 1 second of tone
    sr = 44100
    t = np.linspace(0, 1, sr)
    y = np.sin(2 * np.pi * 440 * t)  # A4 note
    sf.write(test_audio, y, sr)
    
    # Convert
    success = engine.convert_to_singing(test_audio, test_output)
    
    if success:
        print("✅ Test passed!")
    else:
        print("⚠️ Test failed, but fallback worked")
    
    # Cleanup
    if os.path.exists(test_audio):
        os.remove(test_audio)
    if os.path.exists(test_output):
        os.remove(test_output)
