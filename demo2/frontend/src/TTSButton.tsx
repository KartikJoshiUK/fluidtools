import { useState } from "react";
import { FiPauseCircle, FiVolume2 } from "react-icons/fi";

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

export default TTSButton;
