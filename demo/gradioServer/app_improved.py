import gradio as gr
import requests
import time
import json
import re
from urllib.parse import quote

API_URL = "http://154.201.126.27:3000"
client = requests.Session()

session_ok = False
tools_ok = False
initialized = False

pending_requests = []  # stores pending tool requests for UI
pending_auth_token = ""  # stores auth token for pending approvals

# Demo mode - pre-fills fields for quick testing
DEMO_MODE = True

DEMO_SYSTEM_PROMPT = """You are a helpful AI assistant for a banking and task management API.
You can check balances, view transactions, transfer money, and manage tasks.
Be friendly, concise, and always confirm before taking actions."""

DEMO_ENV_VARS = """{
  "API_BASE_URL": "http://localhost:8000"
}"""


def start_session():
    global session_ok
    try:
        r = client.get(f"{API_URL}/session")
        if r.status_code == 200:
            session_ok = True
            return "✅ **Session started!** You can now upload your Postman collection."
        return f"❌ **Failed to start session:** {r.text}\n\n*Make sure the backend server is running on {API_URL}*"
    except Exception as e:
        return f"❌ **Connection Error:** Could not connect to backend server.\n\n**Fix:** Run `cd demo/server && npm start` first.\n\n**Details:** {str(e)}"


def upload_tools(file):
    global tools_ok
    if not session_ok:
        return "⚠️ **Please start the session first** by clicking the 'Start Session' button above."
    try:
        files = {"api": open(file, "rb")}
        r = client.post(f"{API_URL}/tools", files=files)
        if r.status_code == 200:
            tools_ok = True
            try:
                data = r.json()
                tool_count = data.get("toolCount", "multiple")
                return f"✅ **Success!** Generated **{tool_count} tools** from your API collection.\n\n➡️ Now you can initialize the agent below."
            except:
                return "✅ **Tools uploaded & generated successfully!**\n\n➡️ Now you can initialize the agent below."
        return f"❌ **Upload failed:** {r.text}"
    except Exception as e:
        return f"❌ **Error:** {str(e)}"


def initialize(system_prompt, env_json):
    global initialized
    if not (session_ok and tools_ok):
        return "⚠️ **Please upload your Postman collection first!**"

    try:
        parsed_env = json.loads(env_json) if env_json.strip() else {}
    except Exception as e:
        return f"❌ **Invalid JSON in Environment Variables:**\n```\n{str(e)}\n```\n\nExpected format: `{{\"KEY\": \"value\"}}`"

    body = {
        "systemIntructions": system_prompt,
        "envVariables": parsed_env
    }
    try:
        r = client.post(f"{API_URL}/initialize", json=body)
        if r.status_code == 200:
            initialized = True
            return "✅ **Agent initialized successfully!**\n\n🎉 You can now start chatting below!"
        return f"❌ **Initialization failed:** {r.text}"
    except Exception as e:
        return f"❌ **Error:** {str(e)}"


def detect_chart_url(text):
    quickchart_pattern = r'(https://quickchart\.io/chart\?[^\s\)]+)'
    match = re.search(quickchart_pattern, text)
    return match.group(1) if match else None


def format_response_with_chart(message):
    chart_url = detect_chart_url(message)
    if chart_url:
        return message + f"\n\n![Chart Visualization]({chart_url})", chart_url
    return message, None


def call_query(message, auth_token):
    headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
    params = {"query": message}

    try:
        # FIXED: endpoint must be /query
        r = client.get(f"{API_URL}", params=params, headers=headers, timeout=30)
        body = r.json()
        return {"message": body.get("message", ""), "pending": body.get("data", [])}
    except requests.exceptions.Timeout:
        return {"message": "⏱️ Request timed out. The API might be slow or unresponsive.", "pending": []}
    except Exception as e:
        return {"message": f"❌ Error: {str(e)}", "pending": []}


def chat_send(message, history, auth_token):
    global pending_requests, pending_auth_token

    if not initialized:
        history.append((None, "⚠️ **Please initialize the agent first!**\n\nGo to **STEP 1** above and complete the setup."))
        return history, "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)

    if not message.strip():
        return history, "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)

    # FIXED: Add user message as tuple
    history.append((message, None))

    # Show loading
    history[-1] = (message, "🔄 *Thinking and calling APIs...*")
    yield history, "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)

    result = call_query(message, auth_token)

    # remove loading message safely
    history[-1] = (message, None)

    if result["pending"]:
        pending_requests = result["pending"]
        pending_auth_token = auth_token

        approvals_msg = "### ⚠️ APPROVAL REQUIRED\n\nThe following action(s) need your permission:\n\n"
        for i, p in enumerate(result["pending"], 1):
            approvals_msg += f"**{i}. Tool:** `{p['name']}`\n"
            if 'args' in p:
                approvals_msg += f"**Arguments:**\n```json\n{json.dumps(p['args'], indent=2)}\n```\n\n"
        approvals_msg += "**👇 Use the buttons below to approve or reject:**"

        # FIXED: approval message
        history[-1] = (message, approvals_msg)

        yield history, "", gr.update(visible=True), gr.update(visible=True), gr.update(visible=True)
    else:
        formatted_message, chart_url = format_response_with_chart(result["message"])
        # FIXED: assistant reply
        history[-1] = (message, formatted_message)

        yield history, "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)


def send_approval(approved, history):
    global pending_requests, pending_auth_token

    if not pending_requests:
        return "⚠️ No pending approvals", history, gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)

    headers = {"Authorization": f"Bearer {pending_auth_token}"} if pending_auth_token else {}
    approval_data = [{"toolCallId": p["id"], "approved": approved} for p in pending_requests]

    try:
        r = client.post(f"{API_URL}/approval", json=approval_data, headers=headers)
        body = r.json()
        message = body.get("message", "Done")
        pending_requests = []

        # FIXED: approval result message
        history.append((None, message))

        return message, history, gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)
    except Exception as e:
        err = f"❌ Error: {str(e)}"
        history.append((None, err))
        return err, history, gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)


def reset_chat():
    global session_ok, tools_ok, initialized, pending_requests, pending_auth_token
    try:
        client.delete(API_URL)
    except:
        pass
    session_ok = tools_ok = initialized = False
    pending_requests = []
    pending_auth_token = ""
    return [], gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)


# --- UI (unchanged below) ----------------------------------------------------
with gr.Blocks(title="FluidTools - AI-Powered API Agent") as demo:

    gr.HTML("""
    <div style="text-align: center; padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 10px; margin-bottom: 30px;">
        <h1 style="margin: 0; font-size: 2.5em;">🤖 FluidTools</h1>
        <p style="margin: 10px 0 0 0; font-size: 1.2em;">Turn any Postman API collection into an AI-powered chatbot</p>
    </div>
    """)

    gr.Markdown("""
    ### 🎯 What This Demo Does:
    1. **Upload** your Postman collection (JSON export from Postman)
    2. **Initialize** the AI agent with your API tools
    3. **Chat** with your APIs using natural language - no coding required!

    ---
    """)

    with gr.Accordion("🚀 STEP 1 — Initialize System", open=True):
        step1_status = gr.Markdown("""
**Current Status:** 🔴 Not started

**Instructions:**
1. Click **"Start Session"** to begin
2. Upload your Postman collection JSON file
3. (Optional) Customize the system prompt
4. (Optional) Add API keys/environment variables
5. Click **"Initialize Agent"** to start
        """)

        with gr.Row():
            start_btn = gr.Button("🧪 Start Session", variant="primary", size="lg")

        gr.Markdown("---")
        gr.Markdown("**📁 Upload Your Postman Collection**")
        gr.Markdown("*Export your collection from Postman as JSON (Collection v2.1)*")

        tool_file = gr.File(file_types=[".json"], label="Postman Collection File", file_count="single")

        gr.Markdown("---")
        gr.Markdown("**⚙️ Configure Agent (Optional)**")

        sys_prompt = gr.Textbox(
            label="System Prompt - Describe how the AI should behave",
            value=DEMO_SYSTEM_PROMPT if DEMO_MODE else "",
            lines=4
        )

        env_vars = gr.Textbox(
            label="Environment Variables (JSON format)",
            value=DEMO_ENV_VARS if DEMO_MODE else "",
            lines=4
        )

        with gr.Row():
            init_btn = gr.Button("🚀 Initialize Agent", variant="primary", interactive=False, size="lg")

    gr.Markdown("---")
    with gr.Accordion("💬 STEP 2 — Chat with Your API", open=True):

        auth_box = gr.Textbox(label="🔐 Authentication Token (optional)", type="password")
        chat = gr.Chatbot(height=500, avatar_images=(None, "🤖"))

        msg = gr.Textbox(label="Your Message", lines=2, max_lines=5)

        with gr.Row():
            send = gr.Button("📤 Send", variant="primary")
            reset = gr.Button("🔄 Reset Conversation")

        approval_section = gr.Markdown("### 🔐 Pending Approvals", visible=False)
        with gr.Row():
            approve_btn = gr.Button("✅ Approve All", visible=False)
            reject_btn = gr.Button("❌ Reject All", visible=False)

        approval_result = gr.Textbox(label="Approval Result", visible=False, interactive=False)

    def update_buttons():
        return gr.update(interactive=session_ok), gr.update(interactive=(session_ok and tools_ok))

    start_btn.click(start_session, None, step1_status).then(update_buttons, None, [tool_file, init_btn])
    tool_file.upload(upload_tools, tool_file, step1_status).then(update_buttons, None, [tool_file, init_btn])
    init_btn.click(initialize, [sys_prompt, env_vars], step1_status)

    send.click(chat_send, [msg, chat, auth_box], [chat, msg, approval_section, approve_btn, reject_btn])
    msg.submit(chat_send, [msg, chat, auth_box], [chat, msg, approval_section, approve_btn, reject_btn])

    approve_btn.click(send_approval, [gr.State(True), chat],
                      [approval_result, chat, approval_section, approve_btn, reject_btn])

    reject_btn.click(send_approval, [gr.State(False), chat],
                      [approval_result, chat, approval_section, approve_btn, reject_btn])

    reset.click(reset_chat, None, [chat, approval_section, approve_btn, reject_btn])

if __name__ == "__main__":
    demo.launch(server_port=7860, share=False, show_error=True)
