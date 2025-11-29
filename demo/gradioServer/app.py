import gradio as gr
import requests
import time
import json

API_URL = "http://localhost:8000"
client = requests.Session()

session_ok = False
tools_ok = False
initialized = False

pending_requests = []  # stores pending tool requests for UI
pending_auth_token = ""  # stores auth token for pending approvals


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

    # Backend returns 'data' field for pending approvals
    return {
        "message": body.get("message", ""),
        "pending": body.get("data", [])
    }


def chat_send(message, history, auth_token):
    global pending_requests, pending_auth_token
    if not initialized:
        return history + [{"role": "assistant", "content": "⚠ Initialize first!"}], "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)

    history.append({"role": "user", "content": message})  # user msg shows instantly
    result = call_query(message, auth_token)

    if result["pending"]:
        pending_requests = result["pending"]
        pending_auth_token = auth_token
        approvals_msg = "⚠️ **APPROVAL REQUIRED**\n\n" + "\n".join(
            [f"• Tool: **{p['name']}** (ID: `{p['id']}`)" for p in result["pending"]]
        )
        approvals_msg += "\n\n👇 Use the buttons below to approve or reject these actions."
        history.append({"role": "assistant", "content": approvals_msg})
        
        # Show approval buttons
        return history, "", gr.update(visible=True), gr.update(visible=True), gr.update(visible=True)
    else:
        history.append({"role": "assistant", "content": result["message"]})
        # Hide approval buttons
        return history, "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)


def send_approval(approved):
    """Send approval/rejection to backend and continue execution."""
    global pending_requests, pending_auth_token
    
    if not pending_requests:
        return "⚠️ No pending approvals", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)
    
    headers = {"Authorization": f"Bearer {pending_auth_token}"} if pending_auth_token else {}
    
    # Build approval payload
    approval_data = [
        {"toolCallId": p["id"], "approved": approved}
        for p in pending_requests
    ]
    
    try:
        r = client.post(f"{API_URL}/approval", json=approval_data, headers=headers)
        body = r.json()
        message = body.get("message", "✅ Approval processed" if approved else "❌ Rejected")
        
        # Clear pending state
        pending_requests = []
        
        return message, gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)
    except Exception as e:
        return f"❌ Error: {str(e)}", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)


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
    
    with gr.Row():
        send = gr.Button("Send", variant="primary")
        reset = gr.Button("Reset")
    
    # Approval section (hidden by default)
    approval_section = gr.Markdown("### 🔐 Pending Approvals", visible=False)
    with gr.Row():
        approve_btn = gr.Button("✅ Approve All", variant="primary", visible=False)
        reject_btn = gr.Button("❌ Reject All", variant="stop", visible=False)
    
    approval_result = gr.Textbox(label="Approval Result", visible=False, interactive=False)

    # Wire up events
    send.click(
        chat_send, 
        [msg, chat, auth_box], 
        [chat, msg, approval_section, approve_btn, reject_btn]
    )
    msg.submit(
        chat_send, 
        [msg, chat, auth_box], 
        [chat, msg, approval_section, approve_btn, reject_btn]
    )
    
    approve_btn.click(
        lambda: send_approval(True),
        None,
        [approval_result, approval_section, approve_btn, reject_btn]
    ).then(
        lambda result: (gr.update(visible=True, value=result), gr.update(visible=False)),
        [approval_result],
        [approval_result, approval_result]
    )
    
    reject_btn.click(
        lambda: send_approval(False),
        None,
        [approval_result, approval_section, approve_btn, reject_btn]
    ).then(
        lambda result: (gr.update(visible=True, value=result), gr.update(visible=False)),
        [approval_result],
        [approval_result, approval_result]
    )
    
    reset.click(
        reset_chat, 
        None, 
        [chat, approval_section, approve_btn, reject_btn]
    )

demo.launch()
