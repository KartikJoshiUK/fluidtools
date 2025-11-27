import axios from "axios";
import {
  useState,
  useEffect,
  useRef,
  type FormEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  FiCopy,
  FiSend,
  FiRotateCw,
  FiCheck,
  FiPauseCircle,
  FiRefreshCw,
  FiMic,
  FiMicOff,
  FiVolume2,
  FiChevronDown,
} from "react-icons/fi";
import MarkdownIt from "markdown-it";

const md = MarkdownIt();

// We'll style rendered markdown via Tailwind classes on the parent container instead of
// overriding MarkdownIt renderer rules. This keeps markdown output unchanged and applies
// styling to nested <pre> and <code> using Tailwind's arbitrary selector variants.

// ------------------ TTSButton (Text-to-Speech) ------------------
function TTSButton({ text }: { text: string }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = () => {
    try {
      if (!("speechSynthesis" in window)) return;
      // stop any existing speech
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.onstart = () => setIsSpeaking(true);
      u.onend = () => setIsSpeaking(false);
      u.onerror = () => setIsSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch (e) {
      console.error("TTS speak failed", e);
      setIsSpeaking(false);
    }
  };

  const stop = () => {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.error("TTS stop failed", e);
    } finally {
      setIsSpeaking(false);
    }
  };

  return (
    <button
      onClick={() => {
        if (isSpeaking) stop();
        else speak();
      }}
      className={`p-2 border rounded-md bg-white hover:bg-gray-200 flex items-center justify-center ${
        isSpeaking ? "opacity-90" : ""
      }`}
      aria-label={isSpeaking ? "Stop speaking" : "Speak message"}
    >
      {isSpeaking ? <FiPauseCircle /> : <FiVolume2 />}
    </button>
  );
}

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

// ------------------ Parent ChatBot (main logic) ------------------
export default function ChatBot() {
  const [inputValue, setInputValue] = useState("");
  const [messages, setMessages] = useState<
    { text: string; sender: "user" | "bot"; approvalButtons?: string[] }[]
  >([{ text: "Hello! How can I assist you today?", sender: "bot" }]);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1000);
    } catch {}
  };

  const sendQuery = async (
    userText: string,
    baseMessages: { text: string; sender: "user" | "bot" }[],
    skipAppendUser = false
  ) => {
    if (isProcessing) return;
    setIsProcessing(true);

    const controller = new AbortController();
    abortCtrlRef.current = controller;

    if (skipAppendUser) {
      setMessages([...baseMessages, { text: "Typing...", sender: "bot" }]);
    } else {
      setMessages([
        ...baseMessages,
        { text: userText, sender: "user" },
        { text: "Typing...", sender: "bot" },
      ]);
    }

    if (!skipAppendUser) setInputValue("");

    try {
      const response = await axios.get("http://localhost:3000/", {
        params: {
          query: userText,
        },
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        signal: controller.signal,
      });
      const message = response.data.message;
      if (Array.isArray(response?.data?.data)) {
        console.log(
          response.data.data,
          response.data.data.map((d: { name: string; id: string }) => d.id)
        );

        setMessages((prev) =>
          prev.slice(0, -1).concat([
            {
              text: message,
              sender: "bot",
              approvalButtons: response.data.data.map(
                (d: { name: string; id: string }) => d.id
              ),
            },
          ])
        );
      }
    } catch (err: any) {
      const isCanceled =
        err?.code === "ERR_CANCELED" || err?.name === "CanceledError";
      setMessages((prev) =>
        prev.slice(0, -1).concat([
          {
            text: isCanceled
              ? "Request cancelled."
              : "Error: Could not reach backend.",
            sender: "bot",
          },
        ])
      );
    } finally {
      setIsProcessing(false);
      abortCtrlRef.current = null;
    }
  };

  const handleApproval = async (
    toolCallIds: string[],
    approved: boolean = true
  ) => {
    if (toolCallIds.length === 0) return;
    const body: {
      toolCallId: string;
      approved: boolean;
    }[] = toolCallIds.map((toolCallId) => ({
      toolCallId,
      approved,
    }));
    try {
      const response = await axios.post(
        "http://localhost:3000/approval",
        body,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
          },
        }
      );
      const message = response.data.message;
      if (Array.isArray(response?.data?.data)) {
        setMessages((prev) =>
          prev.slice(0, -1).concat([
            {
              text: message,
              sender: "bot",
              approvalButtons: response.data.data.map(
                (d: { toolName: string; toolCallId: string }) => d.toolCallId
              ),
            },
          ])
        );
      }
    } catch (err: any) {
      const isCanceled =
        err?.code === "ERR_CANCELED" || err?.name === "CanceledError";
      setMessages((prev) =>
        prev.slice(0, -1).concat([
          {
            text: isCanceled
              ? "Request cancelled."
              : "Error: Could not reach backend.",
            sender: "bot",
          },
        ])
      );
    } finally {
      setIsProcessing(false);
      abortCtrlRef.current = null;
    }
  };

  const handleResetChat = async () => {
    try {
      await axios.delete("http://localhost:3000", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });
    } catch (err) {
    } finally {
      setMessages([
        { text: "Hello! How can I help you today?", sender: "bot" },
      ]);
    }
  };

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (isProcessing) return;
    await sendQuery(inputValue, messages, false);
  };

  return (
    <div className="h-full w-full flex flex-col items-center bg-gray-100">
      <ul
        ref={listRef}
        className="flex-1 overflow-y-auto p-4 bg-white rounded-md w-full flex flex-col gap-4"
      >
        {messages.map((m, i) => (
          <li
            key={i}
            className={`flex items-center gap-2 break-words max-w-full ${
              m.sender === "user" ? "flex-row-reverse self-end" : "self-start"
            }`}
          >
            <div className="flex flex-col w-full">
              {m.sender === "user" ? (
                <div className="p-2 rounded-md bg-blue-500 text-white break-words whitespace-pre-wrap max-w-full">
                  {m.text}
                </div>
              ) : (
                <div
                  className="p-2 rounded-md bg-gray-200 text-black break-words whitespace-pre-wrap max-w-full prose overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: md.render(m.text) }}
                />
              )}
              {Array.isArray(m?.approvalButtons) &&
                m.approvalButtons.length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={async () =>
                        await handleApproval(m.approvalButtons ?? [])
                      }
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={async () =>
                        await handleApproval(m.approvalButtons ?? [], false)
                      }
                    >
                      Reject
                    </button>
                  </div>
                )}
              <div></div>

              <div
                className={`mt-1 flex items-center gap-2 ${
                  m.sender === "user" ? "flex-row-reverse" : ""
                }`}
              >
                {m.sender === "bot" && (
                  <>
                    {i > 0 && (
                      <button
                        onClick={() => {
                          const userIndex = i - 1;
                          const userText = messages[userIndex]?.text;
                          if (userText)
                            sendQuery(userText, messages.slice(0, i), true);
                        }}
                        className="p-2 border rounded-md bg-white"
                      >
                        <FiRefreshCw />
                      </button>
                    )}

                    <TTSButton text={m.text} />
                  </>
                )}

                <button
                  onClick={() => handleCopy(m.text, i)}
                  className={`p-2 rounded-md border ${
                    m.sender === "user" ? "bg-blue-500 text-white" : "bg-white"
                  }`}
                >
                  {copiedIndex === i ? <FiCheck /> : <FiCopy />}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <form className="w-full p-4" onSubmit={handleSendMessage}>
        <div className="flex items-center gap-3 bg-white rounded-full px-3 py-2 border border-gray-300">
          <button
            type="button"
            onClick={async () => {
              await handleResetChat();
            }}
            className="p-2 hover:bg-gray-200 rounded-full"
          >
            <FiRotateCw size={18} />
          </button>

          <STTControl setInputValue={setInputValue} setError={setError} />

          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (
                  !isProcessing &&
                  inputValue.trim() !== "" &&
                  !(
                    messages.length > 0 &&
                    messages[messages.length - 1].sender === "user"
                  )
                ) {
                  void sendQuery(inputValue, messages, false);
                }
              }
            }}
            className="flex-1 bg-transparent text-black resize-none h-10 px-2 py-1 focus:outline-none"
            placeholder="Speak or type..."
          />

          {isProcessing ? (
            <button
              type="button"
              onClick={() => abortCtrlRef.current?.abort()}
              className="p-2 bg-yellow-500 text-white rounded-full"
            >
              <FiPauseCircle size={18} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="p-2 bg-blue-500 text-white rounded-full"
            >
              <FiSend size={18} />
            </button>
          )}
        </div>
        <div className="p-2 text-xs">
          {error ? (
            <span className="text-red-600">{error}</span>
          ) : (
            <span className="text-gray-700">
              Chatbot makes mistakes. Please verify critical information.
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
