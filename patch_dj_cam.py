import re

with open("C:/Mood-based-Recommender/js/app.js", "r", encoding="utf-8") as f:
    content = f.read()

# Update refreshCameraDevices to also populate dj-camera-device-select
old_func = """                selector.innerHTML = '';
                videoDevices.forEach((device, idx) => {
                    const opt = document.createElement('option');
                    opt.value = device.deviceId;
                    opt.text = device.label || 'Camera ' + (idx + 1);
                    selector.appendChild(opt);
                });"""

new_func = """                selector.innerHTML = '';
                const djSelector = document.getElementById('dj-camera-device-select');
                if (djSelector) djSelector.innerHTML = '';

                videoDevices.forEach((device, idx) => {
                    const opt = document.createElement('option');
                    opt.value = device.deviceId;
                    opt.text = device.label || 'Camera ' + (idx + 1);
                    selector.appendChild(opt);

                    if (djSelector) {
                        const opt2 = document.createElement('option');
                        opt2.value = device.deviceId;
                        opt2.text = device.label || 'Camera ' + (idx + 1);
                        djSelector.appendChild(opt2);
                    }
                });"""

content = content.replace(old_func, new_func)

# Also update the part that selects the value
old_val = """                if (videoDevices.length > 0 && !window.selectedVideoDeviceId) {
                    window.selectedVideoDeviceId = videoDevices[0].deviceId;
                    selector.value = window.selectedVideoDeviceId;
                } else if (window.selectedVideoDeviceId) {
                    selector.value = window.selectedVideoDeviceId;
                }"""

new_val = """                if (videoDevices.length > 0 && !window.selectedVideoDeviceId) {
                    window.selectedVideoDeviceId = videoDevices[0].deviceId;
                    selector.value = window.selectedVideoDeviceId;
                    if (djSelector) djSelector.value = window.selectedVideoDeviceId;
                } else if (window.selectedVideoDeviceId) {
                    selector.value = window.selectedVideoDeviceId;
                    if (djSelector) djSelector.value = window.selectedVideoDeviceId;
                }"""

content = content.replace(old_val, new_val)

# Add onDJCameraDeviceChange function
dj_cam_change = """
        window.onDJCameraDeviceChange = async (select) => {
            window.selectedVideoDeviceId = select.value;
            // Sync with main selector
            const mainSelector = document.getElementById('camera-device-select');
            if (mainSelector) mainSelector.value = window.selectedVideoDeviceId;

            // Restart DJ webcam with new device if active
            const video = document.getElementById('dj-video');
            if (video && video.srcObject) {
                stopDJWebcam();
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        video: { deviceId: { exact: window.selectedVideoDeviceId } } 
                    });
                    video.srcObject = stream;
                } catch (e) {
                    console.error("Error switching DJ camera:", e);
                }
            }
        };
"""

if "window.onDJCameraDeviceChange =" not in content:
    # insert after window.onCameraDeviceChange
    content = content.replace("initCamera();\n            }\n        };", "initCamera();\n            }\n        };\n" + dj_cam_change)

# Update startDJRadio to use selectedVideoDeviceId
content = content.replace("video: { facingMode: 'user' }", "window.selectedVideoDeviceId ? { deviceId: { exact: window.selectedVideoDeviceId } } : { facingMode: 'user' }")

with open("C:/Mood-based-Recommender/js/app.js", "w", encoding="utf-8") as f:
    f.write(content)
