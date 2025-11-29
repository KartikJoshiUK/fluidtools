import gradio as gr
import requests
import time
import json
import re
from urllib.parse import quote
from datetime import datetime
from collections import Counter

API_URL = "http://localhost:3000"
client = requests.Session()

session_ok = False
tools_ok = False
initialized = False

pending_requests = []
pending_auth_token = ""

# Session analytics
session_stats = {
    "total_tokens": 0,
    "tools_used": [],
    "queries_count": 0,
    "approvals_granted": 0,
    "approvals_rejected": 0,
    "session_start": None
}

# Demo mode
DEMO_MODE = True

DEMO_SYSTEM_PROMPT = """You are a helpful AI assistant for a banking and task management API.
You can check balances, view transactions, transfer money, and manage tasks.
Be friendly, concise, and always confirm before taking actions."""

DEMO_ENV_VARS = """{
  "API_BASE_URL": "http://localhost:8000"
}"""


def estimate_tokens(text):
    """Rough token estimation"""
    return int(len(text.split()) * 1.3)

def get_session_stats():
    """Format session statistics"""
    if not session_stats["session_start"]:
        return "No active session"
    
    duration = (datetime.now() - session_stats["session_start"]).seconds
    mins = duration // 60
    secs = duration % 60
    
    tool_counts = Counter(session_stats["tools_used"])
    top_tools = tool_counts.most_common(3)
    
    stats_html = f"""
<div style="padding: 15px; background: #f8f9fa; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 15px;">
        <div style="background: white; padding: 12px; border-radius: 6px; border-left: 3px solid #4CAF50;">
            <div style="font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Queries</div>
            <div style="font-size: 24px; font-weight: 600; color: #333;">{session_stats["queries_count"]}</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px; border-left: 3px solid #2196F3;">
            <div style="font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px;">Tokens</div>
            <div style="font-size: 24px; font-weight: 600; color: #333;">~{session_stats["total_tokens"]}</div>
        </div>
    </div>
    <div style="background: white; padding: 12px; border-radius: 6px; margin-bottom: 15px;">
        <div style="font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Tools Used</div>
        <div style="font-size: 13px; color: #333;">
            {', '.join([f"{tool} ({count}x)" for tool, count in top_tools]) if top_tools else "No tools used yet"}
        </div>
    </div>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
        <div style="background: white; padding: 12px; border-radius: 6px;">
            <div style="font-size: 11px; color: #666;">Approved</div>
            <div style="font-size: 18px; font-weight: 600; color: #4CAF50;">{session_stats["approvals_granted"]}</div>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px;">
            <div style="font-size: 11px; color: #666;">Rejected</div>
            <div style="font-size: 18px; font-weight: 600; color: #f44336;">{session_stats["approvals_rejected"]}</div>
        </div>
    </div>
    <div style="margin-top: 12px; font-size: 11px; color: #999; text-align: center;">
        Session: {mins}m {secs}s
    </div>
</div>
"""
    return stats_html

def start_session():
    global session_ok
    try:
        r = client.get(f"{API_URL}/session")
        if r.status_code == 200:
            session_ok = True
            session_stats["session_start"] = datetime.now()
            return "Session active. Upload your Postman collection below.", get_session_stats()
        return f"Failed to start session: {r.text}\n\nMake sure the backend is running on {API_URL}", get_session_stats()
    except Exception as e:
        return f"Connection error. Start the backend first:\n\n```\ncd demo/server && npm start\n```\n\nError: {str(e)}", get_session_stats()


def upload_tools(file):
    global tools_ok
    if not session_ok:
        return "Start the session first.", get_session_stats()
    try:
        files = {"api": open(file, "rb")}
        r = client.post(f"{API_URL}/tools", files=files)
        if r.status_code == 200:
            tools_ok = True
            try:
                data = r.json()
                tool_count = data.get("toolCount", "multiple")
                return f"Generated {tool_count} tools from your collection. Ready to initialize.", get_session_stats()
            except:
                return "Tools uploaded successfully. Ready to initialize.", get_session_stats()
        return f"Upload failed: {r.text}", get_session_stats()
    except Exception as e:
        return f"Error: {str(e)}", get_session_stats()


def initialize(system_prompt, env_json):
    global initialized
    if not (session_ok and tools_ok):
        return "Upload your Postman collection first.", get_session_stats()

    try:
        parsed_env = json.loads(env_json) if env_json.strip() else {}
    except Exception as e:
        return f"Invalid JSON: {str(e)}\n\nExpected: {{\"KEY\": \"value\"}}", get_session_stats()

    body = {
        "systemIntructions": system_prompt,
        "envVariables": parsed_env
    }
    try:
        r = client.post(f"{API_URL}/initialize", json=body)
        if r.status_code == 200:
            initialized = True
            return "Agent initialized. Start chatting below.", get_session_stats()
        return f"Initialization failed: {r.text}", get_session_stats()
    except Exception as e:
        return f"Error: {str(e)}", get_session_stats()


def detect_chart_url(text):
    """Detect if message contains a chart URL (QuickChart, Chart.js, etc.)"""
    # Pattern for QuickChart URLs
    quickchart_pattern = r'(https://quickchart\.io/chart\?[^\s\)]+)'
    match = re.search(quickchart_pattern, text)
    if match:
        return match.group(1)
    return None


def format_response_with_chart(message):
    """Format response to display charts as images if URL is detected"""
    chart_url = detect_chart_url(message)

    if chart_url:
        # Add the chart as an embedded image
        formatted_msg = message + f"\n\n![Chart Visualization]({chart_url})"
        return formatted_msg, chart_url

    return message, None


def call_query(message, auth_token):
    """Hit /query and return both normal and pending approval results."""
    headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
    params = {"query": message}

    try:
        r = client.get(API_URL, params=params, headers=headers, timeout=30)
        body = r.json()
        
        # Track tokens
        response_text = body.get("message", "")
        tokens = estimate_tokens(message) + estimate_tokens(response_text)
        session_stats["total_tokens"] += tokens
        session_stats["queries_count"] += 1
        
        # Track tools used
        if "tools" in body:
            for tool in body.get("tools", []):
                session_stats["tools_used"].append(tool)
        
        return {
            "message": body.get("message", ""),
            "pending": body.get("data", []),
            "tools": body.get("tools", [])
        }
    except requests.exceptions.Timeout:
        return {"message": "Request timed out.", "pending": [], "tools": []}
    except Exception as e:
        return {"message": f"Error: {str(e)}", "pending": [], "tools": []}


def chat_send(message, history, auth_token):
    global pending_requests, pending_auth_token

    if not initialized:
        return (
            history + [{"role": "assistant", "content": "Initialize the agent first (see setup above)"}],
            "",
            gr.update(visible=False),
            gr.update(visible=False),
            gr.update(visible=False),
            get_session_stats()
        )

    if not message.strip():
        return history, "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False), get_session_stats()

    # Add user message
    history.append({"role": "user", "content": message})

    # Show loading state
    history.append({"role": "assistant", "content": "Processing..."})
    yield history, "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False), get_session_stats()

    # Make API call
    result = call_query(message, auth_token)

    # Remove loading message
    history = history[:-1]

    if result["pending"]:
        pending_requests = result["pending"]
        pending_auth_token = auth_token

        # Format approval message
        approvals_msg = "**Approval Required**\n\n"
        
        for i, p in enumerate(result["pending"], 1):
            approvals_msg += f"**{i}. {p['name']}**\n"
            if 'args' in p:
                approvals_msg += f"```json\n{json.dumps(p['args'], indent=2)}\n```\n"

        history.append({"role": "assistant", "content": approvals_msg})

        yield history, "", gr.update(visible=True), gr.update(visible=True), gr.update(visible=True), get_session_stats()
    else:
        # Format response
        formatted_message, chart_url = format_response_with_chart(result["message"])
        
        # Add tool usage info if tools were used
        if result.get("tools"):
            tool_names = ", ".join(result["tools"])
            formatted_message += f"\n\n<sub>Tools used: {tool_names}</sub>"
            # Track tools
            for tool in result["tools"]:
                session_stats["tools_used"].append(tool)

        history.append({"role": "assistant", "content": formatted_message})

        yield history, "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False), get_session_stats()


def send_approval(approved, history):
    """Send approval/rejection to backend and continue execution."""
    global pending_requests, pending_auth_token

    if not pending_requests:
        return "No pending approvals", history, gr.update(visible=False), gr.update(visible=False), gr.update(visible=False), get_session_stats()

    # Track approval stats
    if approved:
        session_stats["approvals_granted"] += len(pending_requests)
    else:
        session_stats["approvals_rejected"] += len(pending_requests)

    headers = {"Authorization": f"Bearer {pending_auth_token}"} if pending_auth_token else {}

    # Build approval payload
    approval_data = [
        {"toolCallId": p["id"], "approved": approved}
        for p in pending_requests
    ]

    try:
        r = client.post(f"{API_URL}/approval", json=approval_data, headers=headers)
        body = r.json()
        message = body.get("message", "Approved" if approved else "Rejected")

        # Clear pending state
        pending_requests = []

        # Add the message to chat history
        history.append({"role": "assistant", "content": message})

        return message, history, gr.update(visible=False), gr.update(visible=False), gr.update(visible=False), get_session_stats()
    except Exception as e:
        error_msg = f"Error: {str(e)}"
        history.append({"role": "assistant", "content": error_msg})
        return error_msg, history, gr.update(visible=False), gr.update(visible=False), gr.update(visible=False), get_session_stats()


def reset_chat():
    global session_ok, tools_ok, initialized, pending_requests, pending_auth_token
    try:
        client.delete(API_URL)
    except:
        pass
    session_ok = tools_ok = initialized = False
    pending_requests = []
    pending_auth_token = ""
    
    # Reset stats but keep session start time
    session_stats["total_tokens"] = 0
    session_stats["tools_used"] = []
    session_stats["queries_count"] = 0
    session_stats["approvals_granted"] = 0
    session_stats["approvals_rejected"] = 0
    
    return [], gr.update(visible=False), gr.update(visible=False), gr.update(visible=False), get_session_stats()


# Custom CSS for modern look
custom_css = """
.container {
    max-width: 1400px;
    margin: 0 auto;
}
.header-box {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 2rem;
    border-radius: 12px;
    margin-bottom: 2rem;
    text-align: center;
    color: white;
}
.stat-card {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    border-left: 3px solid #667eea;
}
.setup-section {
    background: #f8f9fa;
    padding: 1.5rem;
    border-radius: 10px;
    margin-bottom: 1rem;
}
.chat-section {
    background: white;
    border-radius: 10px;
    padding: 1rem;
}
"""

# Build the UI
with gr.Blocks(title="FluidTools") as demo:

    # Header
    gr.HTML("""
    <div class="header-box">
        <h1 style="margin: 0; font-size: 2.2em; font-weight: 700;">FluidTools</h1>
        <p style="margin: 0.5rem 0 0 0; font-size: 1.1em; opacity: 0.95;">Chat with your APIs using natural language</p>
    </div>
    """)

    # Main layout with sidebar
    with gr.Row():
        # Left sidebar - Stats
        with gr.Column(scale=1, min_width=300):
            gr.Markdown("### Session Stats")
            stats_display = gr.HTML(get_session_stats())
            refresh_stats_btn = gr.Button("Refresh", size="sm", variant="secondary")
            
        # Main content
        with gr.Column(scale=3):
            # Setup section
            with gr.Group():
                gr.Markdown("### Setup")
                
                step1_status = gr.Markdown("Not started")
                
                with gr.Row():
                    start_btn = gr.Button("Start Session", variant="primary", size="sm")
                
                tool_file = gr.File(
                    file_types=[".json"],
                    label="Postman Collection",
                    file_count="single"
                )

                with gr.Accordion("Advanced Settings", open=False):
                    sys_prompt = gr.Textbox(
                        label="System Prompt",
                        value=DEMO_SYSTEM_PROMPT if DEMO_MODE else "You are a helpful AI assistant.",
                        lines=3,
                        placeholder="Describe how the AI should behave..."
                    )

                    env_vars = gr.Textbox(
                        label="Environment Variables (JSON)",
                        value=DEMO_ENV_VARS if DEMO_MODE else "",
                        placeholder='{"API_KEY": "your-key"}',
                        lines=3
                    )

                init_btn = gr.Button("Initialize Agent", variant="primary", interactive=False)

            # Chat section
            gr.Markdown("### Chat")
            
            with gr.Accordion("Example Queries", open=False):
                gr.Examples(
                    examples=[
                        "What's my account balance?",
                        "Show my last 5 transactions",
                        "Transfer $50 to user 2",
                        "What tasks do I have?",
                        "Create a task: Review FluidTools"
                    ],
                    inputs=gr.Textbox(visible=False),
                    label=None
                )

            auth_box = gr.Textbox(
                label="Auth Token (optional)",
                type="password",
                placeholder="Bearer token or API key",
                scale=1
            )

            chat = gr.Chatbot(
                height=450,
                show_label=False,
            )

            with gr.Row():
                msg = gr.Textbox(
                    placeholder="Ask something...",
                    show_label=False,
                    scale=4,
                    container=False
                )
                send = gr.Button("Send", variant="primary", scale=1)

            with gr.Row():
                reset = gr.Button("Reset", size="sm", scale=1)
                
            # Approval section (hidden by default)
            approval_section = gr.Markdown("", visible=False)
            with gr.Row():
                approve_btn = gr.Button("Approve", variant="primary", visible=False, size="sm")
                reject_btn = gr.Button("Reject", variant="stop", visible=False, size="sm")

            approval_result = gr.Textbox(visible=False, interactive=False)

    # Footer
    gr.Markdown("""
    <div style="text-align: center; padding: 1.5rem; color: #666; font-size: 0.9em; border-top: 1px solid #eee; margin-top: 2rem;">
        <p style="margin: 0;">Built with FluidTools | Multi-provider LLM support | Human-in-the-loop safety</p>
        <p style="margin: 0.5rem 0 0 0;">
            <a href="https://github.com/KartikJoshiUK/fluidtools" target="_blank" style="color: #667eea; text-decoration: none;">GitHub</a> · 
            <a href="https://www.npmjs.com/package/fluidtools" target="_blank" style="color: #667eea; text-decoration: none;">NPM</a>
        </p>
    </div>
    """)

    # Wire up event handlers
    def update_buttons():
        return gr.update(interactive=session_ok), gr.update(interactive=(session_ok and tools_ok))

    start_btn.click(
        start_session, 
        None, 
        [step1_status, stats_display]
    ).then(
        update_buttons, 
        None, 
        [tool_file, init_btn]
    )
    
    tool_file.upload(
        upload_tools, 
        tool_file, 
        [step1_status, stats_display]
    ).then(
        update_buttons, 
        None, 
        [tool_file, init_btn]
    )
    
    init_btn.click(
        initialize, 
        [sys_prompt, env_vars], 
        [step1_status, stats_display]
    )
    
    refresh_stats_btn.click(
        lambda: get_session_stats(),
        None,
        stats_display
    )

    send.click(
        chat_send,
        [msg, chat, auth_box],
        [chat, msg, approval_section, approve_btn, reject_btn, stats_display]
    )

    msg.submit(
        chat_send,
        [msg, chat, auth_box],
        [chat, msg, approval_section, approve_btn, reject_btn, stats_display]
    )

    approve_btn.click(
        send_approval,
        [gr.State(True), chat],
        [approval_result, chat, approval_section, approve_btn, reject_btn, stats_display]
    )

    reject_btn.click(
        send_approval,
        [gr.State(False), chat],
        [approval_result, chat, approval_section, approve_btn, reject_btn, stats_display]
    )

    reset.click(
        reset_chat,
        None,
        [chat, approval_section, approve_btn, reject_btn, stats_display]
    )

# Launch the app
if __name__ == "__main__":
    demo.launch(

        server_port=7860,
        share=False,  # Set to True to get public URL
        show_error=True
    )