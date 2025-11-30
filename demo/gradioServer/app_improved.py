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

# Provider configuration
PROVIDERS = {
    "nebius-free": {
        "name": "🆓 Nebius Free (10 requests/day)",
        "requires_key": False,
        "description": "Free tier using Nebius AI"
    },
    "openai": {
        "name": "💰 OpenAI (Your API Key)",
        "requires_key": True,
        "description": "Use your OpenAI API key"
    },
    "anthropic": {
        "name": "💰 Anthropic (Your API Key)",
        "requires_key": True,
        "description": "Use your Anthropic API key"
    },
    "gemini": {
        "name": "💰 Google Gemini (Your API Key)",
        "requires_key": True,
        "description": "Use your Google Gemini API key"
    }
}

# ============================================
# GLASSMORPHISM CSS
# ============================================
CUSTOM_CSS = """
/* Root Variables */
:root {
    --glass-primary: rgba(102, 126, 234, 0.7);
    --glass-primary-dark: rgba(118, 75, 162, 0.8);
    --glass-accent: rgba(139, 92, 246, 0.6);
    --glass-white: rgba(255, 255, 255, 0.25);
    --glass-white-hover: rgba(255, 255, 255, 0.35);
    --text-primary: rgba(30, 30, 50, 0.95);
    --text-secondary: rgba(60, 60, 80, 0.75);
    --text-light: rgba(255, 255, 255, 0.95);
    --glass-border: rgba(255, 255, 255, 0.3);
    --shadow-sm: 0 4px 6px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 8px 16px rgba(0, 0, 0, 0.1);
    --shadow-lg: 0 16px 32px rgba(0, 0, 0, 0.15);
    --shadow-glow: 0 0 40px rgba(102, 126, 234, 0.2);
    --blur-sm: blur(8px);
    --blur-md: blur(16px);
    --blur-lg: blur(24px);
}

/* Global Background - Animated Gradient */
.gradio-container {
    background: linear-gradient(135deg,
        #e0e7ff 0%,
        #f0e7ff 25%,
        #e7e0ff 50%,
        #f5e7ff 75%,
        #e0e7ff 100%) !important;
    background-size: 400% 400% !important;
    animation: gradientShift 15s ease infinite;
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', sans-serif !important;
}

@keyframes gradientShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
}

/* Glass Card Base */
.glass-card {
    background: var(--glass-white) !important;
    backdrop-filter: var(--blur-md) !important;
    -webkit-backdrop-filter: var(--blur-md) !important;
    border-radius: 20px !important;
    border: 1px solid var(--glass-border) !important;
    box-shadow: var(--shadow-md) !important;
    padding: 24px !important;
    margin-bottom: 20px !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-card:hover {
    background: var(--glass-white-hover) !important;
    box-shadow: var(--shadow-lg), var(--shadow-glow) !important;
    transform: translateY(-2px);
}

/* Buttons - Glassmorphic */
button {
    border-radius: 12px !important;
    padding: 12px 24px !important;
    font-weight: 600 !important;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
    letter-spacing: 0.3px;
    position: relative;
    overflow: hidden;
}

button.primary,
button[variant="primary"] {
    background: linear-gradient(135deg, var(--glass-primary) 0%, var(--glass-primary-dark) 100%) !important;
    backdrop-filter: var(--blur-sm) !important;
    border: 1px solid rgba(255, 255, 255, 0.4) !important;
    color: white !important;
    box-shadow: var(--shadow-sm) !important;
}

button.primary:hover,
button[variant="primary"]:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: var(--shadow-md), var(--shadow-glow) !important;
    background: linear-gradient(135deg,
        rgba(102, 126, 234, 0.85) 0%,
        rgba(118, 75, 162, 0.9) 100%) !important;
}

button.secondary,
button[variant="secondary"] {
    background: var(--glass-white) !important;
    backdrop-filter: var(--blur-sm) !important;
    border: 1px solid var(--glass-border) !important;
    color: var(--text-primary) !important;
}

button.secondary:hover,
button[variant="secondary"]:hover {
    background: var(--glass-white-hover) !important;
    transform: translateY(-1px);
}

/* Input Fields - Frosted Glass */
input[type="text"],
input[type="password"],
textarea,
.input-field {
    background: rgba(255, 255, 255, 0.4) !important;
    backdrop-filter: var(--blur-sm) !important;
    -webkit-backdrop-filter: var(--blur-sm) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 12px !important;
    padding: 12px 16px !important;
    color: var(--text-primary) !important;
    transition: all 0.3s ease;
}

input:focus,
textarea:focus {
    background: rgba(255, 255, 255, 0.6) !important;
    border-color: var(--glass-primary) !important;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1), var(--shadow-sm) !important;
    outline: none !important;
}

/* Dropdowns - Glass Style */
select,
.dropdown,
.dropdown select,
.gradio-dropdown,
.gradio-dropdown .wrap,
.gradio-dropdown input,
.gradio-dropdown .wrap-inner,
.svelte-1gfkn6j {
    background: rgba(255, 255, 255, 0.4) !important;
    backdrop-filter: var(--blur-sm) !important;
    -webkit-backdrop-filter: var(--blur-sm) !important;
    border: 1px solid var(--glass-border) !important;
    border-radius: 12px !important;
    padding: 10px 16px !important;
    color: var(--text-primary) !important;
    transition: all 0.3s ease;
}

/* Chatbot - Glass Container */
.chatbot {
    background: var(--glass-white) !important;
    backdrop-filter: var(--blur-lg) !important;
    -webkit-backdrop-filter: var(--blur-lg) !important;
    border-radius: 20px !important;
    border: 1px solid var(--glass-border) !important;
    padding: 20px !important;
    box-shadow: var(--shadow-md) !important;
}

/* File Upload Styling */
.file-upload-container {
    background: rgba(255, 255, 255, 0.25) !important;
    backdrop-filter: var(--blur-md) !important;
    -webkit-backdrop-filter: var(--blur-md) !important;
    border: 2px dashed rgba(102, 126, 234, 0.4) !important;
    border-radius: 20px !important;
    padding: 32px !important;
    text-align: center;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.file-upload-container:hover {
    background: var(--glass-white-hover) !important;
    border-color: var(--glass-primary) !important;
    transform: scale(1.01);
    box-shadow: var(--shadow-md), var(--shadow-glow) !important;
}

/* Accordion Styling */
.accordion {
    background: var(--glass-white) !important;
    backdrop-filter: var(--blur-md) !important;
    -webkit-backdrop-filter: var(--blur-md) !important;
    border-radius: 16px !important;
    border: 1px solid var(--glass-border) !important;
    margin-bottom: 20px !important;
    overflow: hidden !important;
    box-shadow: var(--shadow-sm) !important;
    transition: all 0.3s ease;
}

.accordion:hover {
    box-shadow: var(--shadow-md) !important;
}

/* Markdown Content Styling */
.markdown-content,
.prose {
    color: var(--text-primary) !important;
    line-height: 1.7;
}

/* Ensure all text is visible - Fix white on white issue */
label,
.label,
.gradio-label,
.gr-form label,
span,
p,
div,
.markdown-body,
.gr-text-input label,
.gr-dropdown label,
.gr-textbox label,
.gr-file label,
.gr-accordion .label-wrap span {
    color: var(--text-primary) !important;
}

/* Specific fixes for textboxes and inputs */
.gr-text-input input,
.gr-text-input textarea,
.gr-textbox input,
.gr-textbox textarea {
    color: var(--text-primary) !important;
}

/* Dropdown text visibility */
.gr-dropdown .wrap,
.gr-dropdown option,
select option {
    color: var(--text-primary) !important;
    background: rgba(255, 255, 255, 0.95) !important;
}

/* Chat messages */
.message,
.bot,
.user {
    color: var(--text-primary) !important;
}

/* Accordion headers */
.gr-accordion button span {
    color: var(--text-primary) !important;
    font-weight: 600;
}

/* Button text visibility */
button span,
button {
    color: inherit !important;
}

/* Force all Gradio components to have visible text */
.gr-box *,
.gr-form *,
.gr-input *,
.gr-panel * {
    color: var(--text-primary) !important;
}

/* Dropdown specific fixes */
.gr-dropdown,
.gr-dropdown *,
.dropdown,
.dropdown * {
    color: var(--text-primary) !important;
}

.gr-dropdown .wrap,
.gr-dropdown .wrap * {
    background: rgba(255, 255, 255, 0.6) !important;
    color: var(--text-primary) !important;
}

/* Input text color */
input,
textarea {
    color: var(--text-primary) !important;
}

/* Ensure dropdown options are visible */
.gr-dropdown ul,
.gr-dropdown li {
    background: rgba(255, 255, 255, 0.95) !important;
    color: var(--text-primary) !important;
}

/* Scrollbar Styling */
::-webkit-scrollbar {
    width: 10px;
    height: 10px;
}

::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
}

::-webkit-scrollbar-thumb {
    background: var(--glass-primary);
    border-radius: 10px;
    backdrop-filter: var(--blur-sm);
}

::-webkit-scrollbar-thumb:hover {
    background: var(--glass-primary-dark);
}

/* Responsive Adjustments */
@media (max-width: 768px) {
    .glass-card {
        padding: 16px !important;
        border-radius: 16px !important;
    }

    button {
        padding: 10px 20px !important;
    }
}

/* Accessibility - Reduce Motion */
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}

/* Float Animation for Hero */
@keyframes float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(20px, 20px) scale(1.1); }
}

/* Fade In Animation */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Slide Down Animation */
@keyframes slideDown {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
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


# ============================================
# HELPER FUNCTIONS
# ============================================
def format_status(message, status_type="info"):
    """
    Create a glassmorphic status message with color-coded styling.

    Args:
        message: The status message text
        status_type: Type of status - 'success', 'error', 'warning', or 'info'

    Returns:
        HTML string with glassmorphic styling
    """
    icons = {
        'success': '✅',
        'error': '❌',
        'warning': '⚠️',
        'info': 'ℹ️'
    }

    colors = {
        'success': {
            'bg': 'rgba(16, 185, 129, 0.15)',
            'border': 'rgba(16, 185, 129, 0.4)',
            'text': 'rgb(6, 95, 70)'
        },
        'error': {
            'bg': 'rgba(239, 68, 68, 0.15)',
            'border': 'rgba(239, 68, 68, 0.4)',
            'text': 'rgb(127, 29, 29)'
        },
        'warning': {
            'bg': 'rgba(245, 158, 11, 0.15)',
            'border': 'rgba(245, 158, 11, 0.4)',
            'text': 'rgb(120, 53, 15)'
        },
        'info': {
            'bg': 'rgba(59, 130, 246, 0.15)',
            'border': 'rgba(59, 130, 246, 0.4)',
            'text': 'rgb(30, 58, 138)'
        }
    }

    icon = icons.get(status_type, 'ℹ️')
    color_scheme = colors.get(status_type, colors['info'])

    return f"""<div style="
    background: {color_scheme['bg']};
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid {color_scheme['border']};
    border-radius: 12px;
    padding: 16px;
    margin: 12px 0;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    animation: fadeIn 0.3s ease;
">
    <span style="font-size: 1.5em; flex-shrink: 0;">{icon}</span>
    <div style="
        color: {color_scheme['text']};
        font-size: 0.95em;
        line-height: 1.5;
        flex: 1;
    ">{message}</div>
</div>"""


def start_session():
    global session_ok
    try:
        r = client.get(f"{API_URL}/session")
        if r.status_code == 200:
            session_ok = True
            return format_status("Session started! You can now upload your Postman collection.", "success")
        return format_status(f"Failed to start session: {r.text}<br><br>Make sure the backend server is running on {API_URL}", "error")
    except Exception as e:
        return format_status(f"Connection Error: Could not connect to backend server.<br><br><strong>Fix:</strong> Run <code>cd demo/server && npm start</code> first.<br><br><strong>Details:</strong> {str(e)}", "error")


def upload_tools(file):
    global tools_ok
    if not session_ok:
        return format_status("Please start the session first by clicking the 'Start Session' button above.", "warning")
    try:
        files = {"api": open(file, "rb")}
        r = client.post(f"{API_URL}/tools", files=files)
        if r.status_code == 200:
            tools_ok = True
            try:
                data = r.json()
                tool_count = data.get("toolCount", "multiple")
                return format_status(f"Success! Generated <strong>{tool_count} tools</strong> from your API collection.<br><br>➡️ Now you can initialize the agent below.", "success")
            except:
                return format_status("Tools uploaded & generated successfully!<br><br>➡️ Now you can initialize the agent below.", "success")
        return format_status(f"Upload failed: {r.text}", "error")
    except Exception as e:
        return format_status(f"Error: {str(e)}", "error")


def initialize(system_prompt, env_json, provider, api_key):
    global initialized
    if not (session_ok and tools_ok):
        return format_status("Please upload your Postman collection first!", "warning")

    try:
        parsed_env = json.loads(env_json) if env_json.strip() else {}
    except Exception as e:
        return format_status(f"Invalid JSON in Environment Variables:<br><pre>{str(e)}</pre><br>Expected format: <code>{{\"KEY\": \"value\"}}</code>", "error")

    # Validate API key for paid providers
    provider_config = PROVIDERS.get(provider, {})
    if provider_config.get("requires_key") and not api_key:
        return format_status(f"API Key Required: Please enter your {provider_config['name']} API key", "error")

    body = {
        "systemIntructions": system_prompt,
        "envVariables": parsed_env,
        "provider": provider,
        "apiKey": api_key if api_key else None
    }

    try:
        r = client.post(f"{API_URL}/initialize", json=body)
        if r.status_code == 200:
            initialized = True

            # Check rate limit status
            rate_info = ""
            try:
                rate_r = client.get(f"{API_URL}/rate-limit")
                if rate_r.status_code == 200:
                    rate_data = rate_r.json()
                    if rate_data.get("isFreeTier"):
                        remaining = rate_data.get("remaining", 0)
                        rate_info = f"<br><br>📊 <strong>Requests remaining today:</strong> {remaining}/10"
            except:
                pass

            return format_status(f"Agent initialized successfully with {provider_config['name']}!{rate_info}<br><br>🎉 You can now start chatting below!", "success")

        if r.status_code == 429:
            # Rate limit exceeded
            try:
                error_data = r.json()
                reset_time = error_data.get("resetDate", "tomorrow")
                return format_status(f"Rate Limit Exceeded:<br><br>You've used all 10 free requests for today.<br><br>⏰ Reset time: {reset_time}<br><br>💡 <strong>Tip:</strong> Switch to a paid provider (OpenAI, Anthropic, or Gemini) with your own API key for unlimited requests!", "error")
            except:
                return format_status("Rate Limit Exceeded: Please try again tomorrow or use a paid provider.", "error")

        return format_status(f"Initialization failed: {r.text}", "error")
    except Exception as e:
        return format_status(f"Error: {str(e)}", "error")


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


# --- UI (Glassmorphism Design) ----------------------------------------------------
with gr.Blocks(
    title="FluidTools - AI-Powered API Agent",
    css=CUSTOM_CSS,
    head=STORAGE_JS + GLASSMORPHISM_JS
) as demo:

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

    ---
    """, elem_classes=["glass-card"])

    with gr.Accordion("🚀 STEP 1 — Initialize System", open=True, elem_classes=["glass-card"]):
        step1_status = gr.HTML(format_status(
            """<strong>Current Status:</strong> 🔴 Not started<br><br>
            <strong>Instructions:</strong><br>
            1. Click <strong>"Start Session"</strong> to begin<br>
            2. Upload your Postman collection JSON file<br>
            3. Choose your LLM provider<br>
            4. (Optional) Enter API key for paid providers<br>
            5. (Optional) Customize the system prompt<br>
            6. (Optional) Add API keys/environment variables<br>
            7. Click <strong>"Initialize Agent"</strong> to start""",
            "info"
        ))

        with gr.Row():
            start_btn = gr.Button("🧪 Start Session", variant="primary", size="lg")

        gr.Markdown("---")
        gr.Markdown("**📁 Upload Your Postman Collection**")
        gr.Markdown("*Export your collection from Postman as JSON (Collection v2.1)*")

        tool_file = gr.File(file_types=[".json"], label="Postman Collection File", file_count="single")

        gr.Markdown("---")
        gr.Markdown("**🤖 Choose LLM Provider**")

        provider_selector = gr.Dropdown(
            choices=[(v["name"], k) for k, v in PROVIDERS.items()],
            value="nebius-free",
            label="Select Provider",
            interactive=True,
            elem_classes=["dropdown"]
        )

        api_key_box = gr.Textbox(
            label="API Key (required for paid providers)",
            type="password",
            placeholder="Enter your API key here...",
            visible=False,
            info="Your API key is stored locally in your browser and sent directly to the backend",
            elem_classes=["glass-input"]
        )

        # Show/hide API key based on provider selection
        def update_api_key_visibility(provider):
            requires_key = PROVIDERS.get(provider, {}).get("requires_key", False)
            return gr.update(visible=requires_key)

        provider_selector.change(
            update_api_key_visibility,
            inputs=[provider_selector],
            outputs=[api_key_box]
        )

        gr.Markdown("---")
        gr.Markdown("**⚙️ Configure Agent (Optional)**")

        sys_prompt = gr.Textbox(
            label="System Prompt - Describe how the AI should behave",
            value=DEMO_SYSTEM_PROMPT if DEMO_MODE else "",
            lines=4,
            elem_classes=["glass-input"]
        )

        env_vars = gr.Textbox(
            label="Environment Variables (JSON format)",
            value=DEMO_ENV_VARS if DEMO_MODE else "",
            lines=4,
            elem_classes=["glass-input"]
        )

        with gr.Row():
            init_btn = gr.Button("🚀 Initialize Agent", variant="primary", interactive=False, size="lg")

    gr.Markdown("---")
    with gr.Accordion("💬 STEP 2 — Chat with Your API", open=True, elem_classes=["glass-card"]):

        auth_box = gr.Textbox(label="🔐 Authentication Token (optional)", type="password", elem_classes=["glass-input"])
        chat = gr.Chatbot(height=500, avatar_images=(None, "🤖"), elem_classes=["chatbot"], bubble_full_width=False)

        msg = gr.Textbox(label="Your Message", lines=2, max_lines=5, elem_classes=["glass-input"])

        with gr.Row():
            send = gr.Button("📤 Send", variant="primary")
            reset = gr.Button("🔄 Reset Conversation", variant="secondary")

        approval_section = gr.Markdown("### 🔐 Pending Approvals", visible=False, elem_classes=["glass-card"])
        with gr.Row():
            approve_btn = gr.Button("✅ Approve All", visible=False, elem_id="approve-btn")
            reject_btn = gr.Button("❌ Reject All", visible=False, elem_id="reject-btn")

        approval_result = gr.Textbox(label="Approval Result", visible=False, interactive=False)

    def update_buttons():
        return gr.update(interactive=session_ok), gr.update(interactive=(session_ok and tools_ok))

    start_btn.click(start_session, None, step1_status).then(update_buttons, None, [tool_file, init_btn])
    tool_file.upload(upload_tools, tool_file, step1_status).then(update_buttons, None, [tool_file, init_btn])
    init_btn.click(initialize, [sys_prompt, env_vars, provider_selector, api_key_box], step1_status)

    send.click(chat_send, [msg, chat, auth_box], [chat, msg, approval_section, approve_btn, reject_btn])
    msg.submit(chat_send, [msg, chat, auth_box], [chat, msg, approval_section, approve_btn, reject_btn])

    approve_btn.click(send_approval, [gr.State(True), chat],
                      [approval_result, chat, approval_section, approve_btn, reject_btn])

    reject_btn.click(send_approval, [gr.State(False), chat],
                      [approval_result, chat, approval_section, approve_btn, reject_btn])

    reset.click(reset_chat, None, [chat, approval_section, approve_btn, reject_btn])

if __name__ == "__main__":
    demo.launch(server_port=7860, share=False, show_error=True)
