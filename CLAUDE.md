# salesforce-nl

A natural language interface for Salesforce. Type what you want in plain English — query records, update opportunities, log tasks — without navigating the UI or knowing SOQL.

Built with Claude tool use: the LLM decides which Salesforce operations to call and chains them automatically. Zero hardcoded routing logic.

## Architecture

```
User input
  → agent.ts (Claude agentic loop)
    → tools.ts (tool definitions Claude reads to decide what to call)
    → salesforce.ts (jsforce operations against the Salesforce API)
  → formatted response
```

`agent.ts` runs a while loop: send message + tool definitions to Claude → if Claude calls a tool, execute it and send the result back → repeat until Claude returns a final text response.

## Running the project

```bash
npx ts-node src/index.ts
```

Requires a `.env` file (see `.env.example`):
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `SALESFORCE_ACCESS_TOKEN` — from `sf org display --target-org <alias> --verbose`
- `SALESFORCE_INSTANCE_URL` — from the same command

Authenticate with Salesforce via SF CLI before running:
```bash
sf org login web --alias devorg
sf org display --target-org devorg --verbose
```

## Key files

| File | Purpose |
|---|---|
| `src/index.ts` | CLI entry point — readline loop, maintains conversation history |
| `src/agent.ts` | Claude agentic loop, tool execution, rate limiting |
| `src/tools.ts` | Tool definitions (name, description, input schema) that Claude uses to decide what to call |
| `src/salesforce.ts` | jsforce client, all Salesforce operations, input sanitization |

## Available tools

- `get_opportunities` — list open deals, filter by stage or account
- `search_records` — find Accounts, Contacts, or Opportunities by name
- `get_record_details` — full details on a record by ID
- `create_task` — log a follow-up task linked to an account or contact
- `update_opportunity` — change stage, amount, or close date
- `create_contact` — add a contact to an account

## Reliability

- **Rate limiting:** 10 Salesforce API calls per 10 seconds (sliding window) + 10 tool calls max per agent turn
- **Input sanitization:** single quotes escaped in all SOQL WHERE clauses; object types validated against an allowlist
- **Error handling:** tool failures return structured errors Claude can explain to the user

## Adding a new tool

1. Add the Salesforce operation as a named export in `salesforce.ts`
2. Add the tool definition (name, description, input_schema) to the `tools` array in `tools.ts`
3. Add a `case` to the `switch` in `executeTool` in `agent.ts`

The description in step 2 is load-bearing — it's what Claude reads to decide when and how to call the tool. Write it like you're briefing a smart colleague.
