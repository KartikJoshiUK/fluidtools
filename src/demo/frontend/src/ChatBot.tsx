import axios from "axios";
import { useState, useEffect, useRef, type FormEvent } from "react";
import {
  FiCopy,
  FiSend,
  FiRotateCw,
  FiCheck,
  FiPauseCircle,
  FiRefreshCw,
} from "react-icons/fi";
import MarkdownIt from "markdown-it";
import TTSButton from "./TTSButton";
import STTControl from "./STTButton";

const md = MarkdownIt();

// We'll style rendered markdown via Tailwind classes on the parent container instead of
// overriding MarkdownIt renderer rules. This keeps markdown output unchanged and applies
// styling to nested <pre> and <code> using Tailwind's arbitrary selector variants.

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
  const [approvalLoading, setApprovalLoading] = useState(false);

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
      setMessages((prev) =>
        prev.slice(0, -1).concat([
          {
            text: message,
            sender: "bot",
            approvalButtons: Array.isArray(response?.data?.data)
              ? response.data.data.map(
                  (d: { name: string; id: string }) => d.id
                )
              : undefined,
          },
        ])
      );
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
    setApprovalLoading(true); // Set loading state to true
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

      console.log(message);

      setMessages((prev) =>
        prev.slice(0, -1).concat([
          {
            text: message,
            sender: "bot",
            approvalButtons: Array.isArray(response?.data?.data)
              ? response.data.data.map(
                  (d: { name: string; id: string }) => d.id
                )
              : undefined,
          },
        ])
      );
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
      setApprovalLoading(false); // Set loading state to false
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
                  <div className="py-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="p-1 border rounded-sm bg-white hover:bg-gray-100 cursor-pointer"
                      onClick={async () =>
                        await handleApproval(m.approvalButtons ?? [])
                      }
                      disabled={approvalLoading}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="p-1 border rounded-sm bg-white hover:bg-gray-100 cursor-pointer"
                      onClick={async () =>
                        await handleApproval(m.approvalButtons ?? [], false)
                      }
                      disabled={approvalLoading}
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
