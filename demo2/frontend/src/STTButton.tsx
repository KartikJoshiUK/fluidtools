import {
  useState,
  useEffect,
  type Dispatch,
  type SetStateAction,
  useRef,
} from "react";
import { FiMic, FiMicOff, FiChevronDown } from "react-icons/fi";

// ------------------ STTControl (Speech-to-Text + device selector) ------------------
function STTControl({
  setInputValue,
  setError,
}: {
  setInputValue: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string | null>>;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const stopMediaStream = () => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
    } catch (err) {
      console.error("Error stopping media stream", err);
    }
  };

  useEffect(() => {
    let mounted = true;
    const refreshDevices = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices)
          return;
        const all = await navigator.mediaDevices.enumerateDevices();
        const inputs = all.filter((d) => d.kind === "audioinput");
        if (!mounted) return;
        setDevices(inputs);
        if (!selectedDeviceId && inputs.length > 0) {
          setSelectedDeviceId((prev) => prev ?? inputs[0].deviceId);
        }
      } catch (err) {
        console.error("Failed to enumerate devices", err);
      }
    };

    void refreshDevices();
    const onChange = () => void refreshDevices();
    try {
      navigator.mediaDevices.addEventListener("devicechange", onChange);
    } catch (e) {}

    return () => {
      mounted = false;
      try {
        navigator.mediaDevices.removeEventListener("devicechange", onChange);
      } catch (e) {}
      stopMediaStream();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
        recognitionRef.current = null;
      }
    };
  }, [selectedDeviceId]);

  const startRecognition = () => {
    const ensureStreamForSelected = async () => {
      try {
        if (!selectedDeviceId) return;
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop());
          mediaStreamRef.current = null;
        }
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: selectedDeviceId } },
        } as MediaStreamConstraints);
        mediaStreamRef.current = s;
      } catch (err) {
        console.error("Failed to get media for selected device", err);
        setError("Could not access selected microphone");
        setTimeout(() => setError(null), 3000);
      }
    };

    void ensureStreamForSelected().then(() => {
      console.log(
        "startRecognition: selectedDeviceId=",
        selectedDeviceId,
        "available devices=",
        devices
      );
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn("Error stopping previous recognition before start", e);
        }
        recognitionRef.current = null;
      }
      const win = window as any;
      const SpeechRecognition =
        win.SpeechRecognition || win.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        console.log("SpeechRecognition not supported in this browser");
        return;
      }

      const r = new SpeechRecognition();
      recognitionRef.current = r;
      r.lang = "en-US";
      r.interimResults = true;
      r.maxAlternatives = 1;

      r.onstart = () => {
        console.log("STT: started");
        setIsListening(true);
      };

      r.onresult = (ev: any) => {
        let interim = "";
        let final = "";
        for (let i = ev.resultIndex; i < ev.results.length; ++i) {
          const res = ev.results[i];
          if (res.isFinal) final += res[0].transcript;
          else interim += res[0].transcript;
        }
        console.log("STT interim:", interim, "final:", final);
        setInputValue((prev) => {
          if (final && final.trim().length > 0) return final;
          if (interim) return interim;
          return prev;
        });
      };

      r.onerror = (ev: any) => {
        console.error("STT error", ev);
        const code = ev?.error || ev?.message || "unknown";
        let friendly = "Speech recognition error";
        if (code === "no-speech") friendly = "No speech detected — try again.";
        if (code === "not-allowed" || code === "permission-denied")
          friendly =
            "Microphone permission denied. Please allow microphone access.";
        if (code === "aborted") friendly = "Speech recognition aborted.";
        setError(friendly);
        setIsListening(false);
        setTimeout(() => setError(null), 3000);
      };

      r.onend = () => {
        console.log("STT: ended");
        setIsListening(false);
      };

      try {
        r.start();
      } catch (err) {
        console.error("STT start failed", err);
      }
    });
  };

  const stopRecognition = () => {
    try {
      const r = recognitionRef.current;
      if (r) {
        try {
          r.stop();
        } catch (e) {
          console.warn("Error stopping recognition", e);
        }
      }
      recognitionRef.current = null;
      setIsListening(false);
    } catch (err) {
      console.error("STT stop failed", err);
    }
  };

  useEffect(() => {
    if (!showDropdown) return;
    const onDocClick = (e: MouseEvent) => {
      const el = dropdownRef.current;
      if (el && !el.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showDropdown]);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center bg-white border border-gray-400 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => {
            if (isListening) stopRecognition();
            else startRecognition();
          }}
          className={`p-2 flex items-center justify-center ${
            isListening ? "bg-red-500 text-white" : "bg-green-500 text-white"
          }`}
          aria-label={isListening ? "Stop listening" : "Start listening"}
        >
          {isListening ? <FiMicOff size={16} /> : <FiMic size={16} />}
        </button>

        <button
          type="button"
          onClick={() => setShowDropdown((s) => !s)}
          className="p-2  border-l border-gray-400 flex items-center justify-center"
          aria-haspopup="menu"
          aria-expanded={showDropdown}
        >
          <FiChevronDown size={16} />
        </button>
      </div>

      {showDropdown && (
        <div className="absolute left-full bottom-full mt-2 w-48 bg-white border border-gray-400 overflow-hidden rounded-md shadow-md z-50">
          <div className="max-h-48 overflow-auto">
            {devices.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-600">
                Default microphone
              </div>
            ) : (
              devices.map((d, idx) => (
                <button
                  type="button"
                  key={d.deviceId || idx}
                  onClick={async () => {
                    const id = d.deviceId || null;
                    if (isListening) stopRecognition();
                    setSelectedDeviceId(id);
                    try {
                      stopMediaStream();
                      if (id) {
                        const s = await navigator.mediaDevices.getUserMedia({
                          audio: { deviceId: { exact: id } },
                        } as MediaStreamConstraints);
                        mediaStreamRef.current = s;
                      }
                      setShowDropdown(false);
                    } catch (err) {
                      console.error("Failed to use selected device", err);
                      setError("Could not access selected microphone");
                      setTimeout(() => setError(null), 3000);
                    }
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-gray-100 text-sm ${
                    selectedDeviceId === d.deviceId
                      ? "bg-gray-200 font-medium"
                      : ""
                  }`}
                >
                  {d.label || `Microphone ${idx + 1}`}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default STTControl;
