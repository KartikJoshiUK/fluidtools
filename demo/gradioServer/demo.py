import gradio as gr
import requests
import time

API_URL = "http://localhost:3000"
client = requests.Session()  # 🟢 Persistent session (cookie preserved)

session_ok = False
tools_ok = False
initialized = False


def start_session():
    global session_ok
    try:
        r = client.get(f"{API_URL}/session")
        if r.status_code == 200:
            session_ok = True
            return "🟢 Session started successfully."
        return f"🔴 Failed: {r.text}"
    except Exception as e:
        return f"❌ Error: {str(e)}"


def upload_tools(file):
    global tools_ok
    if not session_ok:
        return "⚠ Start session first."
    try:
        files = {"api": open(file, "rb")}
        r = client.post(f"{API_URL}/tools", files=files)
        if r.status_code == 200:
            tools_ok = True
            return "🟢 Tools uploaded & generated."
        return f"🔴 Failed: {r.text}"
    except Exception as e:
        return f"❌ Error: {str(e)}"


def initialize(system_prompt, env_json):
    global initialized
    if not (session_ok and tools_ok):
        return "⚠ Upload tools first."
    try:
        body = {
            "systemIntructions": system_prompt,
            "envVariables": env_json or {}
        }
        r = client.post(f"{API_URL}/initialize", json=body)
        if r.status_code == 200:
            initialized = True
            return "🟢 Agent initialized successfully."
        return f"🔴 Failed: {r.text}"
    except Exception as e:
        return f"❌ Error: {str(e)}"


def chat_send(message, history, auth_token):
    if not initialized:
        return history + [{"role": "assistant", "content": "⚠ Initialize first!"}]

    history = history + [{"role": "user", "content": message}]
    history = history + [{"role": "assistant", "content": "⏳ Thinking..."}]

    headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
    params = {"query": message}

    try:
        r = client.get(API_URL, params=params, headers=headers)
        reply = r.json().get("message", "")
    except:
        reply = "❌ Backend unavailable"

    history[-1]["content"] = reply
    return history


def regenerate(history, auth_token):
    last_user = None
    for m in reversed(history):
        if m["role"] == "user":
            last_user = m["content"]
            break
    if not last_user:
        return history
    trimmed = history[:-1]
    return chat_send(last_user, trimmed, auth_token)


with gr.Blocks(title="FluidTools UI") as demo:

    gr.Markdown("## STEP 1 — Initialize System")

    step1_status = gr.Markdown("🔴 Not initialized")

    start_btn = gr.Button("Start Session 🧪")
    tool_file = gr.File(file_types=[".json"])
    sys_prompt = gr.Textbox(label="System Prompt")
    env_vars = gr.Textbox(
        label="Env Variables JSON (optional)",
        placeholder='{"API_KEY": "123", "DB_URL": "xyz"}',
        lines=6
    )

    init_btn = gr.Button("Initialize Agent 🚀", interactive=False)

    def update_buttons():
        return gr.update(interactive=session_ok), gr.update(
            interactive=(session_ok and tools_ok)
        )

    start_btn.click(
        start_session, None, step1_status
    ).then(update_buttons, None, [tool_file, init_btn])

    tool_file.upload(
        upload_tools, tool_file, step1_status
    ).then(update_buttons, None, [tool_file, init_btn])

    init_btn.click(
        initialize, [sys_prompt, env_vars], step1_status
    )

    gr.Markdown("---\n## STEP 2 — Chat")
    auth_box = gr.Textbox(label="Auth Token (optional)", type="password")
    chat = gr.Chatbot(height=500)
    msg = gr.Textbox(placeholder="Ask something...")
    send = gr.Button("Send")
    regen = gr.Button("Regenerate")
    reset = gr.Button("Reset")

    send.click(chat_send, [msg, chat, auth_box], chat)
    msg.submit(chat_send, [msg, chat, auth_box], chat)
    regen.click(regenerate, [chat, auth_box], chat)
    reset.click(lambda: [], None, chat)

demo.launch()
