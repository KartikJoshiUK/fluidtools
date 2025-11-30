# FluidTools:

![NPM Version](https://img.shields.io/npm/v/fluidtools?style=flat-square) ![NPM Downloads](https://img.shields.io/npm/dm/fluidtools?style=flat-square) ![GitHub](https://img.shields.io/github/license/KartikJoshiUK/fluidtools?style=flat-square)

**AI-powered API multi-tool agent with multi-provider support (OpenAI, Anthropic, Ollama, Gemini, Nebius)**

**Available on [NPM](https://www.npmjs.com/package/fluidtools) and [GitHub](https://github.com/KartikJoshiUK/fluidtools)**

## Overview

FluidTools is a powerful NPM package that transforms REST API collections (Postman 2.1 JSON format) into intelligent AI agent tools. Built with TypeScript, it integrates seamlessly into any Node.js/TypeScript server, enabling you to quickly add AI agents that can interact with your APIs using natural language queries.

### Key Features

- 🚀 **One-Click Tool Generation**: Convert Postman collections to LangChain-compatible tools instantly
- 🤖 **Multi-Provider AI Support**: Compatible with OpenAI, Anthropic, Ollama, Gemini, and Nebius
- 🔧 **LangGraph Integration**: Robust agent orchestration with state management and memory
- 📊 **Semantic Tool Selection**: Optional embedding-based tool filtering for large APIs
- ✅ **Human-in-Loop Security**: Exact tool selection and user approval for sensitive operations
- 🌍 **Multi-Language Support**: Babel integration for international chatbot deployment
- 🌐 **Server Agnostic**: Integrates with any Express/Fastify/Koa server
- ⚡ **TypeScript First**: Full type safety with Zod schemas

## Sponsors

<div style="display: flex; justify-content: center; gap: 45px; flex-wrap: wrap; margin: 18px 0; flex-wrap:wrap;">
    <a href="https://www.gradio.app/" target="_blank">
        <img src="https://www.gradio.app/_app/immutable/assets/gradiodark.CbgYRzQH.svg"
            style="height: 30px; object-fit: contain; filter: drop-shadow(0px 0px 10px rgba(140,110,255,0.65)); transition: 0.25s;">
    </a>
    <a href="https://nebius.com/" target="_blank">
        <img src="https://nebius.com/logo.svg"
            style="height: 30px; object-fit: contain; filter: drop-shadow(0px 0px 10px rgba(110,190,255,0.6)); transition: 0.25s;">
    </a>
    <a href="https://modal.com/" target="_blank">
        <img src="https://modal.com/_app/immutable/assets/logo.lottie.CgmMXf1s.png"
            style="height: 30px; object-fit: contain; filter: drop-shadow(0px 0px 10px rgba(255,105,95,0.6)); transition: 0.25s;">
    </a>
</div>

## Installation

```bash
npm install fluidtools
```

## Quick Start

### 1. Convert Postman Collection to Tools

```bash
npx fluidtools ./api.json ./tools.ts
```

Or programmatically:

```typescript
import { postmanToLangChainCode } from "fluidtools";

const collection = JSON.parse(fs.readFileSync("./api.json", "utf-8"));
const code = postmanToLangChainCode(collection);
fs.writeFileSync("./tools.ts", code);
```

### 2. Create AI Agent Server

```typescript
import express from "express";
import { FluidToolsClient, loadProviderConfigFromEnv } from "fluidtools";
import { generateTools } from "./tools.ts"; // Generated tools

const app = express();
app.use(express.json());

const providerConfig = loadProviderConfigFromEnv();
const fluidClient = new FluidToolsClient(
  providerConfig,
  generateTools,
  "You are a helpful API assistant.",
  10, // max tool calls
  true // debug mode
);

app.get("/", async (req, res) => {
  const { query } = req.query;
  const { authorization } = req.headers;

  const token = authorization?.split(" ")[1];
  const response = await fluidClient.query(query, token);

  res.send({ message: response });
});

app.listen(8000);
```

### 3. Query Your AI Agent

```bash
curl -X GET "http://localhost:8000/?query=Get user details and list their projects" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Architecture

### System Architecture Diagram

```mermaid
graph TD
    A[Postman 2.1 JSON] --> B[CLI Tool<br/>fluidtools]
    B --> C[Tool Generation<br/>TypeScript + Zod Schemas]

    C --> D[FluidTools Client]
    D --> E[Optional Embedding Service<br/>Semantic Tool Selection]

    C --> F[System Prompt<br/>Custom Chatbots]
    F --> G[LangGraph Agent<br/>Orchestration & Memory]

    G --> H[Multi-Provider LLM Support]
    H --> I[Multiple Model Support]
    I --> J[Multi-Language Support<br/>Babel Integration]

    J --> K[Server Integration<br/>Express/Fastify/Koa]
    K --> L[API Exposed<br/>REST/WebSocket]

    subgraph "🔧 Tool Conversion Pipeline"
        A
        B
        C
    end

    subgraph "🤖 AI Agent Core"
        D
        F
        G
        H
        I
        J
    end

    subgraph "🌐 Integration Layer"
        K
        L
    end

    subgraph "⚡ Security & Control"
        M[Human-in-Loop<br/>Tool Confirmation]
        N[Exact Tool Selection<br/>Security Controls]
    end

    G --> M
    M --> N

    subgraph "Provider Ecosystem"
        O[OpenAI<br/>GPT-4, GPT-3.5]
        P[Anthropic<br/>Claude 3.5, Opus]
        Q[Ollama<br/>Local Models]
        R[Gemini<br/>2.5 Flash, Pro]
        S[Nebius<br/>Kimi-K2]
    end

    I --> O
    I --> P
    I --> Q
    I --> R
    I --> S

    L --> T[Chatbot UI<br/>Gradio/React/Web]

### System Architecture Overview

1. **Postman Collection Processing**

   - Parses Postman 2.1 JSON format
   - Extracts requests, parameters, bodies, and schemas
   - Generates TypeScript tools with automatic Zod validation

2. **Tool Generation Engine**

   - Converts each API endpoint into a LangChain tool
   - Handles path variables, query parameters, headers
   - Supports all HTTP methods (GET, POST, PUT, DELETE, PATCH)
   - Auto-generates meaningful descriptions

3. **Multi-Provider LLM Integration**

   - Unified interface for different AI providers
   - Configurable model selection and API keys
   - Consistent response formatting

4. **LangGraph Orchestration**

   - Sequential tool execution with memory
   - State persistence using checkpointer
   - Built-in retry mechanisms and error handling

5. **Optional Embedding Layer**

   - Semantic indexing of tool definitions
   - Cosine similarity-based tool selection
   - Reduces token usage for large toolsets

6. **Server Integration**
   - Session-based conversation management
   - Tool call confirmation system
   - Rate limiting and authentication

### Data Flow

```

Postman Collection JSON ──────┐
│
CLI Tool (fluidtools) ────────▼
│
TypeScript Tool Code ─────────▼
│
Express/Fastify Server ──────▼
│
FluidTools Client ───────────▼
│
LangGraph Agent ─────────────▼
│
LLM Provider + Tools ────────▼
│
API Calls + Responses ───────▼
│
User-Friendly Chat Response ──▼

````

## Demo 1: Gradio Integration (Public Testing)

Located in `./demo/server/`, this demo provides a complete Express server with Gradio UI integration for testing your AI agents:

### Features:

- Web upload interface for Postman collections
- Real-time chat with your AI agent
- Provider selection (OpenAI, Anthropic, etc.)
- Rate limiting for free tier testing
- Tool confirmation dialogs
- Session management

### Backend Setup:

```bash
cd demo/server
npm install
npm start
````

Backend runs on `http://localhost:3000`

### Frontend (Gradio UI):

```bash
cd demo/gradioServer
pip install -r requirements.txt
python app.py
```

Frontend runs on `http://localhost:7860` - open this in your browser for the beautiful glassmorphic chat interface with drag-and-drop Postman collection upload and real-time AI chat.

## Demo 2: Real-World Integration (Cloud API Example)

Located in `./demo2/backend/`, this demo shows a production-ready integration with a cloud provider API:

### Features:

- Pre-generated tools from Ace Cloud API
- Simplified server setup
- Custom system prompts
- Environment variable configuration
- Tool approval workflows

This demo converts a comprehensive cloud API (instances, volumes, networks, billing, etc.) into AI tools.

### Backend Setup:

```bash
cd demo2/backend
npm install
npm run dev
```

Backend runs on `http://localhost:8000`

### Frontend (React App):

```bash
cd demo2/frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` - features a modern React chat interface with:

- 🎤 Voice input/output capabilities (STT/TTS)
- 📱 Responsive design with markdown rendering
- ✅ Tool approval dialogs for sensitive operations
- 🔄 Real-time message streaming
- 🎨 Beautiful UI with copy/retry functionality
- 🔧 Advanced chatbot features

The React app connects to the backend API to provide a complete user experience for interacting with your AI agent.

## API Reference

### FluidToolsClient

Main class for managing AI agents.

```typescript
new FluidToolsClient(
  providerConfig: ProviderConfig,
  toolsGenerator: Function,
  systemInstructions?: string,
  maxToolCalls?: number,
  debug?: boolean,
  expireAfterSeconds?: number,
  confirmationConfig?: ToolConfirmationConfig,
  toolsConfig?: Record<string, any>,
  embeddingConfig?: EmbeddingConfig
)
```

### Key Methods

- `query(query: string, accessToken?: string)`: Execute natural language query
- `clearThread(accessToken?: string)`: Clear conversation memory
- `getPendingConfirmations(accessToken?: string)`: Check pending tool approvals
- `approveToolCall(toolCallId: string, accessToken?: string)`: Approve pending tool
- `rejectToolCall(toolCallId: string, accessToken?: string)`: Reject pending tool

### Provider Configuration

```typescript
// Environment Variables
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_BASE_URL=http://localhost:11434

// Or programmatic
const config = {
  provider: "openai",
  model: "gpt-4",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.1
};
```

## CLI Usage

Generate tools from Postman collection:

```bash
fluidtools <input-file> [output-file] [--help]

# Examples
fluidtools api.json tools.ts
fluidtools ./collections/my-api.json
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

ISC

## Contributors

We'd like to thank all the amazing people who have contributed to FluidTools! 👥

- **[KartikJoshiUK](https://github.com/KartikJoshiUK)** - Creator & Lead Developer
- **[Jatin Godnani](https://github.com/jatingodnani)** - Core Contributor

## Support

- 📖 Documentation: [GitHub Wiki](https://github.com/KartikJoshiUK/fluidtools/wiki)
- 🐛 Issues: [GitHub Issues](https://github.com/KartikJoshiUK/fluidtools/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/KartikJoshiUK/fluidtools/discussions)

---

**Built with ❤️ for developers who want AI-powered API interactions**
