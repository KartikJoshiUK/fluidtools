import gradio as gr
import requests
import time
import json

API_URL = "http://localhost:3000"
client = requests.Session()

session_ok = False
tools_ok = False
initialized = False

pending_requests = []  # stores pending tool requests for UI


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
        parsed_env = json.loads(env_json) if env_json else {}
    except Exception as e:
        return f"❌ Invalid JSON: {str(e)}"

    body = {
        "systemIntructions": system_prompt,
        "envVariables": parsed_env
    }
    try:
        r = client.post(f"{API_URL}/initialize", json=body)
        if r.status_code == 200:
            initialized = True
            return "🟢 Agent initialized successfully."
        return f"🔴 Failed: {r.text}"
    except Exception as e:
        return f"❌ Error: {str(e)}"


def call_query(message, auth_token):
    """Hit /query and return both normal and pending approval results."""
    headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
    params = {"query": message}
    r = client.get(API_URL, params=params, headers=headers)

    try:
        body = r.json()
    except:
        return {"message": "❌ Bad response", "pending": []}

    return {
        "message": body.get("message", ""),
        "pending": body.get("pending", [])
    }


def chat_send(message, history, auth_token):
    global pending_requests
    if not initialized:
        return history + [{"role": "assistant", "content": "⚠ Initialize first!"}], ""

    history.append({"role": "user", "content": message})  # user msg shows instantly
    result = call_query(message, auth_token)

    if result["pending"]:
        pending_requests = result["pending"]
        approvals_msg = "\n".join(
            [f"Pending approval for tool **{p['tool']}** (id: `{p['id']}`)" for p in pending_requests]
        )
        history.append({"role": "assistant", "content": approvals_msg})
    else:
        history.append({"role": "assistant", "content": result["message"]})

    return history, ""  # clears textbox immediately


def reset_chat():
    global session_ok, tools_ok, initialized, pending_requests
    try:
        client.delete(API_URL)
    except:
        pass
    session_ok = tools_ok = initialized = False
    pending_requests = []
    return []


with gr.Blocks(title="FluidTools UI") as demo:

    gr.Markdown("## STEP 1 — Initialize System")
    step1_status = gr.Markdown("🔴 Not initialized")

    start_btn = gr.Button("Start Session 🧪")
    tool_file = gr.File(file_types=[".json"])
    sys_prompt = gr.Textbox(label="System Prompt")
    env_vars = gr.Textbox(
        label="Env Variables JSON (optional)",
        placeholder='{"API_KEY": "123"}',
        lines=6
    )
    init_btn = gr.Button("Initialize Agent 🚀", interactive=False)

    def update_buttons():
        return gr.update(interactive=session_ok), gr.update(interactive=(session_ok and tools_ok))

    start_btn.click(start_session, None, step1_status).then(update_buttons, None, [tool_file, init_btn])
    tool_file.upload(upload_tools, tool_file, step1_status).then(update_buttons, None, [tool_file, init_btn])
    init_btn.click(initialize, [sys_prompt, env_vars], step1_status)

    gr.Markdown("---\n## STEP 2 — Chat")

    auth_box = gr.Textbox(label="Auth Token (optional)", type="password")
    chat = gr.Chatbot(height=500)
    msg = gr.Textbox(placeholder="Ask something...")
    send = gr.Button("Send")
    reset = gr.Button("Reset")

    send.click(chat_send, [msg, chat, auth_box], [chat, msg])
    msg.submit(chat_send, [msg, chat, auth_box], [chat, msg])
    reset.click(lambda: reset_chat(), None, chat)

demo.launch()
