import { useEffect, useState } from "react";
import ChatBot from "./ChatBot";
import { FiMessageCircle, FiX } from "react-icons/fi";

export default function App() {
  const [token, setToken] = useState("");
  const [saved, setSaved] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    const existing = localStorage.getItem("accessToken") ?? "";
    setToken(existing);
  }, []);

  const handleSave = () => {
    localStorage.setItem("accessToken", token);
    setSaved(true);
    setTimeout(() => setSaved(false), 1400);
  };

  const handleClear = () => {
    localStorage.removeItem("accessToken");
    setToken("");
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-blue-600 text-white p-4">
        <div className="max-w-4xl mx-auto">Dummy Navbar — My App</div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-2xl bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4">Set Access Token</h2>

          <label className="block text-sm text-gray-700 mb-2">
            Paste your access token below
          </label>
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste access token here"
            className="w-full h-36 p-3 border rounded resize-none mb-4"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700"
            >
              Save
            </button>

            <button
              onClick={handleClear}
              className="bg-gray-100 text-gray-800 py-2 px-4 rounded hover:bg-gray-200 border"
            >
              Clear
            </button>

            {saved && <span className="text-sm text-green-600">Saved!</span>}

            <div className="ml-auto text-sm text-gray-500">
              current:{" "}
              {localStorage.getItem("accessToken") ? "(set)" : "(not set)"}
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-gray-100 text-gray-700 p-4">
        <div className="max-w-4xl mx-auto text-center">
          Dummy Footer — © {new Date().getFullYear()}
        </div>
      </footer>
      {/* Floating chat widget */}
      <div className="fixed right-6 bottom-6 z-50">
        <button
          onClick={() => setShowChat((s) => !s)}
          className="bg-blue-600 text-white p-3 rounded-full shadow-lg hover:bg-blue-700 focus:outline-none flex items-center justify-center"
          aria-label="Toggle chat"
        >
          <FiMessageCircle size={20} />
        </button>
      </div>

      {showChat && (
        <div className="fixed right-6 bottom-20 z-50 w-96 h-[70vh] bg-white rounded-lg shadow-lg overflow-hidden text-xs flex flex-col border border-gray-300">
          <div className="flex items-center justify-between px-4 py-2 bg-blue-600 text-white">
            <div className="font-medium">Chat</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowChat(false)}
                className="text-white/90 hover:text-white focus:outline-none"
                aria-label="Close chat"
              >
                <FiX size={18} />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <ChatBot />
          </div>
        </div>
      )}
    </div>
  );
}
