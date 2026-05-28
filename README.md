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
npx ts-node src/index.ts
```

## Available operations

| What you can say | What happens |
|---|---|
| "Show me open opportunities" | Lists all open deals with stage and amount |
| "What deals are closing this quarter?" | Filters by close date |
| "Move [company] to [stage]" | Updates opportunity stage |
| "Add [name] at [company], email [email]" | Creates a new contact |
| "Log a follow-up with [company] — [notes]" | Creates a task linked to the account |

## Project structure

```
src/
├── index.ts       # CLI loop
├── agent.ts       # Claude agentic loop + rate limiting
├── tools.ts       # Tool definitions Claude uses to route requests
└── salesforce.ts  # Salesforce operations via jsforce
```

## Reliability

- Salesforce API calls are rate-limited (10 calls / 10s sliding window)
- Tool calls capped at 10 per conversation turn to prevent runaway loops
- SOQL inputs sanitized against injection; object types validated against an allowlist
- Tool failures return structured errors Claude can explain rather than raw stack traces
