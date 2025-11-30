import gradio as gr
import requests
import time
import json
import re
from urllib.parse import quote

API_URL = "http://localhost:3000"
client = requests.Session()

session_ok = False
tools_ok = False
initialized = False

pending_requests = []
pending_auth_token = ""

DEMO_MODE = True

DEMO_SYSTEM_PROMPT = """You are a helpful AI assistant for a banking and task management API.
You can check balances, view transactions, transfer money, and manage tasks.
Be friendly, concise, and always confirm before taking actions."""

DEMO_ENV_VARS = """{
  "BASE_URL": "https://<YOUR SERVER IP>"
}"""

PROVIDERS = {
    "nebius-free": {"name": "🆓 Nebius Free (10 requests/12 hour)", "requires_key": False},
    "openai": {"name": "💰 OpenAI (Your API Key)", "requires_key": True},
    "anthropic": {"name": "💰 Anthropic (Your API Key)", "requires_key": True},
    "gemini": {"name": "💰 Google Gemini (Your API Key)", "requires_key": True}
}
MODEL_MAP = {
    "nebius-free": ["moonshotai/Kimi-K2-Instruct"],
    "openai": ["gpt-4.1-mini", "gpt-4.1", "o1"],
    "anthropic": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
    "gemini": ["gemini-2.5-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0"],
}


# ============================================
# GLASSMORPHISM CSS
# ============================================
CUSTOM_CSS = """
/* =========================================================
   DARK GLASSMORPHISM THEME FOR FLUIDTOOLS
========================================================= */
:root {
    --glass-primary: rgba(102, 126, 234, 0.55);
    --glass-primary-dark: rgba(118, 75, 162, 0.65);
    --glass-accent: rgba(139, 92, 246, 0.65);
    --glass-bg: rgba(18, 18, 26, 0.45);
    --glass-hover: rgba(28, 28, 38, 0.57);
    --glass-border: rgba(195, 170, 255, 0.38);
    --text-light: rgba(235, 235, 255, 0.92);
    --text-dim: rgba(190, 190, 220, 0.65);

    --shadow-sm: 0 4px 6px rgba(0, 0, 0, 0.4);
    --shadow-md: 0 10px 18px rgba(0, 0, 0, 0.45);
    --shadow-lg: 0 18px 36px rgba(0, 0, 0, 0.55);
}

/* =========================================================
   GLOBAL BACKGROUND (dark glass, animated)
========================================================= */
.gradio-container {
    background: linear-gradient(135deg,
        #131421 0%,
        #19172c 25%,
        #201a3a 50%,
        #161324 75%,
        #131421 100%) !important;
    background-size: 350% 350% !important;
    animation: gradientShift 18s ease infinite;
    min-height: 100vh;
    font-family: "Inter", "SF Pro Display", "Segoe UI", sans-serif !important;
}
@keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

/* =========================================================
   UNIVERSAL TEXT VISIBILITY FOR DARK MODE
========================================================= */
*, label, span, p, h1, h2, h3, div, .markdown, .prose {
    color: var(--text-light) !important;
}

/* =========================================================
   GLASS CARDS
========================================================= */
.glass-card {
    background: var(--glass-bg) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 20px !important;
    box-shadow: var(--shadow-md) !important;
    padding: 24px !important;
    backdrop-filter: blur(18px) !important;
    -webkit-backdrop-filter: blur(18px) !important;
    transition: 0.25s ease;
}
.glass-card:hover {
    background: var(--glass-hover) !important;
    box-shadow: var(--shadow-lg) !important;
    transform: translateY(-1px);
}

#status_column > * {
    max-width: 100%;
}

/* The real fix: REMOVE overflow clipping on the Gradio column */
#status_column.gr-column {
    overflow: visible !important;
}

/* Sticky fix — transfer scroll to viewport and enable sticky panel */
.gradio-container, .gr-block, .gr-blocks, .gr-row, .gr-column {
    overflow: visible !important;
}

#status_column {
    position: sticky !important;
    top: 20px !important;
    z-index: 999 !important;
    height: max-content !important;
}

/* =========================================================
   BUTTONS
========================================================= */
button {
    border-radius: 12px !important;
    padding: 12px 24px !important;
    font-weight: 600 !important;
    transition: 0.25s ease;
}
button.primary {
    background: linear-gradient(135deg, var(--glass-primary) 0%, var(--glass-primary-dark) 100%) !important;
    border: 1px solid var(--glass-border) !important;
    color: white !important;
    box-shadow: var(--shadow-sm) !important;
}
button.primary:hover {
    transform: translateY(-1px) scale(1.02);
    box-shadow: var(--shadow-md) !important;
}
button.secondary {
    background: var(--glass-bg) !important;
    border: 1px solid var(--glass-border) !important;
    color: var(--text-light) !important;
}
button.secondary:hover {
    background: var(--glass-hover) !important;
}
button.approve-btn {
    background: rgba(0, 180, 85, 0.68) !important;
    border: 1px solid rgba(0, 255, 140, 0.45) !important;
    color: white !important;
}
button.approve-btn:hover {
    background: rgba(0, 205, 95, 0.85) !important;
}

button.reject-btn {
    background: rgba(200, 38, 65, 0.7) !important;
    border: 1px solid rgba(255, 90, 110, 0.5) !important;
    color: white !important;
}
button.reject-btn:hover {
    background: rgba(225, 45, 75, 0.86) !important;
}

/* =========================================================
   INPUTS • TEXTBOX • DROPDOWN
========================================================= */
input, textarea, select {
    background: rgba(25, 25, 36, 0.55) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 12px !important;
    padding: 12px !important;
    color: var(--text-light) !important;
    backdrop-filter: blur(12px) !important;
}

/* FORCE TRUE DROPDOWN INSTEAD OF INPUT */
div[data-testid="dropdown"] input { display: none !important; }
div[data-testid="dropdown"] select { appearance: auto !important; cursor: pointer !important; }

/* =========================================================
   FILE UPLOAD + LABEL BLACK BUG FIX
========================================================= */
[data-testid*="file-upload"] {
    background: rgba(25, 25, 36, 0.55) !important;
    border: 2px dashed rgba(145, 115, 255, 0.55) !important;
    border-radius: 18px !important;
    backdrop-filter: blur(14px) !important;
}
[data-testid*="file-upload"] .label {
    background: rgba(20, 20, 30, 0.75) !important;
    border-radius: 10px !important;
    padding: 6px 12px !important;
    font-weight: 600;
}

/* =========================================================
   SEPARATE SYSTEM PROMPT & ENV JSON VISUALLY
========================================================= */
.gradio-container textarea:last-of-type {
    margin-top: 12px !important;
}

/* =========================================================
   CHAT AREA VISIBILITY
========================================================= */
.gr-chatbot, .chatbot {
    background: rgba(25, 25, 36, 0.45) !important;
    border-radius: 20px !important;
    backdrop-filter: blur(16px) !important;
}
.gr-chatbot .message {
    color: var(--text-light) !important;
}

/* =========================================================
   ACCORDION
========================================================= */
.accordion {
    background: var(--glass-bg) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 18px !important;
    backdrop-filter: blur(14px) !important;
}
.accordion button span {
    color: var(--text-light) !important;
    font-weight: 600;
}

/* =========================================================
   SCROLLBAR
========================================================= */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-thumb {
    background: rgba(140, 110, 255, 0.55);
    border-radius: 10px;
}

/* =========================================================
   RESPONSIVE
========================================================= */
@media (max-width: 768px) {
    .glass-card { padding: 18px !important; }
    button { padding: 10px 20px !important; }
}

"""

# JavaScript for localStorage API key management
STORAGE_JS = """
<script>
function saveApiKey(provider, key) {
    if (key && key.trim()) {
        localStorage.setItem('apiKey_' + provider, key.trim());
    }
}

function loadApiKey(provider) {
    return localStorage.getItem('apiKey_' + provider) || '';
}

function clearApiKey(provider) {
    localStorage.removeItem('apiKey_' + provider);
}
</script>
"""

# ============================================
# GLASSMORPHISM JAVASCRIPT ENHANCEMENTS
# ============================================
GLASSMORPHISM_JS = """
<script>
(function() {
    'use strict';

    // Smooth scroll behavior
    document.documentElement.style.scrollBehavior = 'smooth';

    // Apply glass effects to dynamically loaded elements
    function applyGlassEffect() {
        // Target accordion elements
        const accordions = document.querySelectorAll('.accordion');
        accordions.forEach(acc => {
            if (!acc.classList.contains('glass-processed')) {
                acc.classList.add('glass-card');
                acc.classList.add('glass-processed');
            }
        });

        // Target file upload areas
        const fileUploads = document.querySelectorAll('[data-testid="file-upload"]');
        fileUploads.forEach(upload => {
            if (!upload.classList.contains('file-upload-processed')) {
                upload.classList.add('file-upload-container');
                upload.classList.add('file-upload-processed');
            }
        });

        // Fix dropdown visibility and styling
        const dropdowns = document.querySelectorAll('.gr-dropdown, [role="listbox"]');
        dropdowns.forEach(dropdown => {
            if (!dropdown.classList.contains('dropdown-fixed')) {
                dropdown.classList.add('dropdown-fixed');
                dropdown.style.color = 'rgba(30, 30, 50, 0.95)';

                // Fix all child elements
                const children = dropdown.querySelectorAll('*');
                children.forEach(child => {
                    child.style.color = 'rgba(30, 30, 50, 0.95)';
                });
            }
        });

        // Fix all labels
        const labels = document.querySelectorAll('label, .label, span');
        labels.forEach(label => {
            if (!label.style.color || label.style.color === 'rgb(255, 255, 255)') {
                label.style.color = 'rgba(30, 30, 50, 0.95)';
            }
        });
    }

    // Button ripple effect
    function enhanceButtons() {
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => {
            if (btn.hasAttribute('data-ripple-enhanced')) return;
            btn.setAttribute('data-ripple-enhanced', 'true');

            btn.addEventListener('click', function(e) {
                const ripple = document.createElement('span');
                const rect = this.getBoundingClientRect();
                const size = Math.max(rect.width, rect.height);
                const x = e.clientX - rect.left - size / 2;
                const y = e.clientY - rect.top - size / 2;

                ripple.style.cssText = `
                    width: ${size}px;
                    height: ${size}px;
                    left: ${x}px;
                    top: ${y}px;
                    position: absolute;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.5);
                    transform: scale(0);
                    animation: ripple 0.6s ease-out;
                    pointer-events: none;
                `;

                this.style.position = 'relative';
                this.style.overflow = 'hidden';
                this.appendChild(ripple);

                setTimeout(() => ripple.remove(), 600);
            });
        });
    }

    // Initialize enhancements
    function init() {
        setTimeout(() => {
            applyGlassEffect();
            enhanceButtons();
        }, 500);

        // Re-apply on Gradio updates
        const observer = new MutationObserver(() => {
            applyGlassEffect();
            enhanceButtons();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Add ripple animation CSS
    const style = document.createElement('style');
    style.textContent = `
        @keyframes ripple {
            to { transform: scale(4); opacity: 0; }
        }
    `;
    document.head.appendChild(style);

    // Run on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
</script>
"""


# ----------------------------- STATUS UI -----------------------------
def format_status(message, status_type="info"):
    icons = {"success": "✅", "error": "❌", "warning": "⚠️", "info": "ℹ️"}
    return f"""
    <div style="padding:15px;border-radius:12px;font-size:15px;background:rgba(255,255,255,.2);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.4);">
        <b>{icons.get(status_type,'ℹ️')} STATUS</b><br><br>{message}
    </div>
    """

# ----------------------------- BACKEND CALLS -----------------------------
def start_session():
    global session_ok
    try:
        r = client.get(f"{API_URL}/session")
        if r.status_code == 200:
            session_ok = True
            return format_status("Session started successfully!", "success")
        return format_status(f"Failed to start session: {r.text}", "error")
    except Exception as e:
        return format_status(f"Error: {str(e)}", "error")


def upload_tools(file):
    global tools_ok
    if not session_ok:
        return format_status("Start session first.", "warning")

    try:
        r = client.post(f"{API_URL}/tools", files={"api": open(file, "rb")})
        if r.status_code == 200:
            tools_ok = True
            return format_status("Tools generated from Postman collection!", "success")
        return format_status(f"Upload failed: {r.text}", "error")
    except Exception as e:
        return format_status(f"Error: {str(e)}", "error")


def initialize(system_prompt, env_vars, provider_display, api_key, model_name):
    global initialized

    provider = next((id for id, p in PROVIDERS.items() if p["name"] == provider_display), None)

    try:
        parsed = json.loads(env_vars) if env_vars.strip() else {}
    except Exception as e:
        return format_status(f"Invalid JSON: {str(e)}", "error")

    if PROVIDERS[provider]["requires_key"] and not api_key.strip():
        return format_status("API key required for this provider.", "error")

    body = {
        "systemIntructions": system_prompt,
        "envVariables": parsed,
        "provider": provider,
        "model": model_name,  
        "apiKey": api_key if api_key else None,
    }

    try:
        r = client.post(f"{API_URL}/initialize", json=body)
        if r.status_code == 200:
            initialized = True
            return format_status("Agent initialized! Start chatting below.", "success")
        return format_status(f"Initialization failed: {r.text}", "error")
    except Exception as e:
        return format_status(f"Error: {str(e)}", "error")


# ----------------------------- CHAT LOGIC -----------------------------
def call_query(message, token):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    try:
        r = client.get(API_URL, params={"query": message}, headers=headers)
        body = r.json()
        return {"message": body.get("message", ""), "pending": body.get("data", [])}
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

    # Check for rate limit error
    if "Rate limit exceeded" in result.get("message", ""):
        history[-1] = (message, f"❌ {result['message']}\n\n💡 **Tip:** Switch to a paid provider with your own API key for unlimited requests!")
        yield history, "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)
        return

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
        history[-1] = (message, result["message"])

        yield history, "", gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)


def send_approval(approved, history):
    global pending_requests, pending_auth_token
    if not pending_requests:
        history.append((None, "No pending approvals"))
        return "Done", history, gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)

    data = [{"toolCallId": p["id"], "approved": approved} for p in pending_requests]
    r = client.post(f"{API_URL}/approval", json=data,
                    headers={"Authorization": f"Bearer {pending_auth_token}"} if pending_auth_token else {})
    pending_requests = []
    history.append((None, r.json().get("message", "Done")))
    return "Done", history, gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)


def reset_chat(auth_token):
    global pending_requests, pending_auth_token
    # Attempt to reset session on backend
    try:
        headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
        client.delete(f"{API_URL}/session", headers=headers)
    except Exception as e:
        # Silently handle errors as reset should not fail the UI
        pass
    # Reset only pending requests and chat UI, keep initialization
    pending_requests = []
    pending_auth_token = ""
    return [], gr.update(visible=False), gr.update(visible=False), gr.update(visible=False)

def toggle_provider_fields(provider_display):
    provider_id = next(k for k,v in PROVIDERS.items() if v["name"] == provider_display)
    return (
        gr.update(visible=PROVIDERS[provider_id]["requires_key"]),
        gr.update(visible=True, choices=MODEL_MAP[provider_id], value=MODEL_MAP[provider_id][0])
    )

# ----------------------------- UI -----------------------------
with gr.Blocks(title="FluidTools",css=CUSTOM_CSS,
    head=STORAGE_JS + GLASSMORPHISM_JS) as demo:

     # Glassmorphic Hero Header
    gr.HTML("""
    <div class="hero-header" style="
        text-align: center;
        padding: 48px 32px;
        background: linear-gradient(135deg,
            rgba(102, 126, 234, 0.7) 0%,
            rgba(118, 75, 162, 0.8) 100%);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        color: white;
        border-radius: 24px;
        margin-bottom: 32px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 16px 32px rgba(0, 0, 0, 0.1), 0 0 40px rgba(102, 126, 234, 0.2);
        position: relative;
        overflow: hidden;
    ">
        <div style="position: relative; z-index: 2;">
            <div style="display: inline-block; margin-bottom: 16px; font-size: 4em;
                filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2));">
                🤖
            </div>
            <h1 style="
                margin: 0;
                font-size: 3em;
                font-weight: 700;
                letter-spacing: -1px;
                text-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            ">FluidTools</h1>
            <p style="
                margin: 12px 0 0 0;
                font-size: 1.3em;
                opacity: 0.95;
                font-weight: 400;
                color: rgba(255, 255, 255, 0.9);
            ">Turn any Postman API collection into an AI-powered chatbot</p>
            <div style="
                margin-top: 20px;
                display: inline-flex;
                gap: 12px;
                padding: 8px 20px;
                background: rgba(255, 255, 255, 0.15);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                border-radius: 100px;
                border: 1px solid rgba(255, 255, 255, 0.2);
                font-size: 0.9em;
            ">
                <span>✨ Multi-Provider</span>
                <span style="opacity: 0.5;">|</span>
                <span>🛡️ Human-in-the-Loop</span>
                <span style="opacity: 0.5;">|</span>
                <span>🚀 Zero Code</span>
            </div>
        </div>

        <!-- Animated background circles -->
        <div style="
            position: absolute;
            width: 300px;
            height: 300px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.1) 0%, transparent 70%);
            top: -100px;
            right: -100px;
            z-index: 1;
            animation: float 6s ease-in-out infinite;
        "></div>
        <div style="
            position: absolute;
            width: 200px;
            height: 200px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.08) 0%, transparent 70%);
            bottom: -50px;
            left: -50px;
            z-index: 1;
            animation: float 8s ease-in-out infinite reverse;
        "></div>
    </div>
    """)

    gr.Markdown("""
    ### 🎯 What This Demo Does:
    1. **Upload** your Postman collection (JSON export from Postman)
    2. **Initialize** the AI agent with your API tools
    3. **Chat** with your APIs using natural language - no coding required!
    """, elem_classes=["glass-card"])


    # --- SECTION LAYOUT ---
    with gr.Row():

        # ---- LEFT: STEPS AREA (70%) ----
        with gr.Column(scale=7):

            with gr.Accordion("🚀 STEP 1 — Initialize System", open=True):

                start_btn = gr.Button("🧪 Start Session")
                file_in = gr.File(file_types=[".json"])
                provider_selector = gr.Dropdown(
                    choices=[p["name"] for p in PROVIDERS.values()],
                    value="🆓 Nebius Free (10 requests/day)",
                    label="Provider",
                )
                model_dropdown = gr.Dropdown(
                    label="Model",
                    choices=[],
                    visible=False
                )
                api_key_box = gr.Textbox(label="API Key (required for paid providers)", type="password", visible=False)
                sys_prompt = gr.Textbox(label="System Prompt", value=DEMO_SYSTEM_PROMPT if DEMO_MODE else "")
                env_vars = gr.Textbox(label="Environment Variables JSON", value=DEMO_ENV_VARS if DEMO_MODE else "")
                init_btn = gr.Button("🚀 Initialize Agent", interactive=False)

            with gr.Accordion("💬 STEP 2 — Chat with API", open=False):
                auth_box = gr.Textbox(label="Auth Token", type="password")
                chat = gr.Chatbot(height=450)
                msg = gr.Textbox()
                send = gr.Button("📤 Send")
                reset = gr.Button("🔄 Reset Conversation")

                approval_md = gr.Markdown(visible=False)
                approve_btn = gr.Button("Approve All", visible=False, elem_classes=["approve-btn"])
                reject_btn = gr.Button("Reject All", visible=False, elem_classes=["reject-btn"])
                approval_result = gr.Textbox(visible=False)

        # ---- RIGHT: STATUS AREA (30%) ----
        with gr.Column(scale=3, elem_id="status_column"):
            status_box = gr.HTML(format_status("Awaiting Session Start"))

    gr.HTML("""
    <div style="
        margin-top: 32px;
        padding: 32px;
        text-align: center;
        background: rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.25);
        box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    ">

        <h2 style="font-size: 1.9em; margin-bottom: 20px; font-weight: 700;">
            📚 Learn More
        </h2>

        <div style="
            display: flex;
            justify-content: center;
            gap: 40px;
            flex-wrap: wrap;
            margin-top: 10px;
        ">
            <!-- GitHub -->
            <a href="https://github.com/KartikJoshiUK/fluidtools" target="_blank">
                <img
                    src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/github.svg"
                    style="height: 50px; filter: drop-shadow(0px 0px 10px rgba(200,200,255,0.5)); transition: 0.25s;">
            </a>

            <!-- NPM -->
            <a href="https://www.npmjs.com/package/fluidtools" target="_blank">
                <img
                    src="https://cdn.jsdelivr.net/npm/simple-icons@v11/icons/npm.svg"
                    style="height: 50px; filter: drop-shadow(0px 0px 10px rgba(255,120,120,0.55)); transition: 0.25s;">
            </a>
        </div>

        <div style="margin: 26px 0; height: 2px; width: 75%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
            margin-left:auto; margin-right:auto;"></div>

        <h3 style="margin-bottom: 18px; font-size: 1.6em; font-weight: 700;">
            🌟 Sponsors
        </h3>

        <div style="
            display: flex;
            justify-content: center;
            gap: 45px;
            flex-wrap: wrap;
            margin-top: 18px;
        ">

            <!-- Each logo forced to uniform height = 62px while preserving proportions -->
            <a href="https://www.gradio.app/" target="_blank">
                <img src="https://www.gradio.app/_app/immutable/assets/gradiodark.CbgYRzQH.svg"
                    style="height: 62px; object-fit: contain; filter: drop-shadow(0px 0px 10px rgba(140,110,255,0.65)); transition: 0.25s;">
            </a>

            <a href="https://nebius.com/" target="_blank">
                <img src="https://nebius.com/logo.svg"
                    style="height: 62px; object-fit: contain; filter: drop-shadow(0px 0px 10px rgba(110,190,255,0.6)); transition: 0.25s;">
            </a>

            <a href="https://modal.com/" target="_blank">
                <img src="https://modal.com/_app/immutable/assets/logo.lottie.CgmMXf1s.png"
                    style="height: 62px; object-fit: contain; filter: drop-shadow(0px 0px 10px rgba(255,105,95,0.6)); transition: 0.25s;">
            </a>
        </div>

        <div style="margin-top: 26px; font-size: 0.95em; opacity: 0.85;">
            FluidTools ecosystem • Multi-provider LLM support (OpenAI, Anthropic, Gemini, Nebius) • Human-in-the-loop safety • Semantic tool selection
        </div>
    </div>
    """)



    # INTERACTIONS
    def toggle_api(provider_display):
        provider_id = next(k for k,v in PROVIDERS.items() if v["name"] == provider_display)
        return gr.update(visible=PROVIDERS[provider_id]["requires_key"])

    provider_selector.change(toggle_api, provider_selector, api_key_box)
    provider_selector.change(
        toggle_provider_fields,
        provider_selector,
        [api_key_box, model_dropdown]
    )

    def refresh_buttons():
        return gr.update(interactive=session_ok), gr.update(interactive=(session_ok and tools_ok))

    start_btn.click(start_session, None, status_box).then(refresh_buttons, None, [file_in, init_btn])
    file_in.upload(upload_tools, file_in, status_box).then(refresh_buttons, None, [file_in, init_btn])
    init_btn.click(initialize, [sys_prompt, env_vars, provider_selector, api_key_box, model_dropdown], status_box)

    send.click(chat_send, [msg, chat, auth_box], [chat, msg, approval_md, approve_btn, reject_btn])
    msg.submit(chat_send, [msg, chat, auth_box], [chat, msg, approval_md, approve_btn, reject_btn])

    approve_btn.click(send_approval, [gr.State(True), chat], [approval_result, chat, approval_md, approve_btn, reject_btn])
    reject_btn.click(send_approval, [gr.State(False), chat], [approval_result, chat, approval_md, approve_btn, reject_btn])

    reset.click(reset_chat, auth_box, [chat, approval_md, approve_btn, reject_btn])


if __name__ == "__main__":
    demo.launch(server_port=7860, share=False)
