# salesforce-nl

Talk to your Salesforce data in plain English. No filters, no SOQL, no navigating the UI — just say what you want.

```
You: What open opportunities do we have?
Assistant: Here are your 3 open deals totaling $223,000...

You: Move TechStart to Negotiation/Review stage
Assistant: Done. TechStart — Platform Integration moved from Proposal/Price Quote → Negotiation/Review.

You: Log a follow-up call with Acme Corp — we discussed pricing, circle back next week
Assistant: Logged. Task created on Acme Corp: "Follow-up call — discussed pricing", due June 4, 2026.
```

Built with Claude tool use — the LLM decides which Salesforce operations to run and chains them automatically. The last example above triggers two tool calls (search account → create task) from one sentence without any hardcoded routing logic.

## How it works

You define Salesforce operations as tools with descriptions. Claude reads those descriptions, interprets the user's intent, and decides which tools to call — and in what order. Results feed back into the conversation until Claude has enough to respond.

## Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)
- A Salesforce org (free [Developer Edition](https://developer.salesforce.com/signup) works)
- [Salesforce CLI](https://developer.salesforce.com/tools/salesforcecli) (`npm install -g @salesforce/cli`)

## Setup

**1. Clone and install**
```bash
git clone https://github.com/HeatherHaylett/salesforce-nl.git
cd salesforce-nl
npm install
```

**2. Authenticate with Salesforce**
```bash
sf org login web --alias devorg
sf org display --target-org devorg --verbose
```
Copy the **Access Token** and **Instance URL** from the output.

**3. Configure environment**
```bash
cp .env.example .env
```
Fill in your values in `.env`.

**4. Run**
```bash
npm start
```

## Available operations

| What you can say | What happens |
|---|---|
| "Show me open opportunities" | Lists all open deals with stage and amount |
| "What deals are closing this quarter?" | Filters by close date |
| "What follow-ups do I have open?" | Lists tasks by status |
| "Move [company] to [stage]" | Updates opportunity stage |
| "Add [name] at [company], email [email]" | Creates a new contact |
| "Log a follow-up with [company] — [notes]" | Creates a task linked to the account |

## MCP server

The same Salesforce tools are available as an MCP server, making them accessible from Claude Code or any Claude-powered app:

```bash
npm run mcp
```

Connect from Claude Code by adding to `.claude/mcp_servers.json`:
```json
{
  "salesforce": {
    "command": "npx",
    "args": ["ts-node", "/path/to/salesforce-nl/src/mcp-server.ts"]
  }
}
```

## Project structure

```
src/
├── index.ts        # CLI loop
├── agent.ts        # Claude agentic loop, rate limiting, retries, observability
├── tools.ts        # Tool definitions Claude uses to decide what to call
├── salesforce.ts   # Salesforce operations via jsforce
└── mcp-server.ts   # MCP server — exposes tools to any Claude app
```

## Reliability

- **Retries:** read operations retry up to 3 times with exponential backoff; writes are not retried to avoid duplicate records
- **Rate limiting:** 10 Salesforce API calls per 10s sliding window; 10 tool calls max per conversation turn
- **Observability:** every tool call logged with timestamp, tool name, and duration
- **Fallbacks:** tool failures return structured `{ error, suggestion }` objects Claude can explain to the user
- **Input sanitization:** single quotes escaped in all SOQL WHERE clauses; object types validated against an allowlist
