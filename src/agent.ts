import Anthropic from '@anthropic-ai/sdk'
import { tools } from './tools'
import * as sf from './salesforce'

const client = new Anthropic()

// Max tool calls allowed in a single agent turn — prevents runaway loops
const MAX_TOOL_CALLS_PER_TURN = 10

// Sliding window rate limiter for Salesforce API calls
// Protects against hitting Salesforce's daily API limits on dev orgs
class RateLimiter {
  private timestamps: number[] = []

  constructor(
    private maxCalls: number,  // max calls allowed
    private windowMs: number   // within this time window
  ) {}

  async throttle(): Promise<void> {
    const now = Date.now()
    // Drop timestamps outside the current window
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs)

    if (this.timestamps.length >= this.maxCalls) {
      // Wait until the oldest call falls outside the window
      const oldest = this.timestamps[0]!
      const waitMs = this.windowMs - (now - oldest)
      console.log(`[rate-limiter] Limit reached — waiting ${waitMs}ms`)
      await new Promise(res => setTimeout(res, waitMs))
    }

    this.timestamps.push(Date.now())
  }
}

// 10 Salesforce API calls per 10 seconds
export const sfRateLimiter = new RateLimiter(10, 10_000)

// Read-only operations are safe to retry — writes are not (risk of duplicate records)
const READ_TOOLS = new Set(['get_opportunities', 'search_records', 'get_record_details', 'get_tasks'])

// Retry with exponential backoff — reads only
async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === attempts - 1) throw err
      const waitMs = 1000 * (i + 1) // 1s, 2s
      console.log(`[retry] Attempt ${i + 1} failed — retrying in ${waitMs}ms`)
      await new Promise(res => setTimeout(res, waitMs))
    }
  }
  throw new Error('Unreachable')
}

function getSystemPrompt() {
  const today = new Date().toISOString().split('T')[0]
  return `You are a Salesforce assistant. Help users query and update their Salesforce data using plain language.

Today's date is ${today}.

Guidelines:
- Be concise. Summarize results clearly — don't dump raw data.
- When searching, always look up the record first to get the ID before taking write actions.
- If a request is ambiguous or could affect multiple records, ask a clarifying question before writing.
- For dates, if the user says something like "next Friday" or "end of month", calculate the correct YYYY-MM-DD date relative to today.
- Confirm write actions (create, update) with a short summary of what you did.`
}

type Message = Anthropic.MessageParam

export async function runAgent(
  userMessage: string,
  history: Message[]
): Promise<{ reply: string; history: Message[] }> {
  const messages: Message[] = [
    ...history,
    { role: 'user', content: userMessage }
  ]

  let reply = ''
  let toolCallCount = 0

  // Agentic loop — Claude may call multiple tools before giving a final response
  while (true) {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: getSystemPrompt(),
      tools,
      messages
    })

    // Add Claude's response to the message history
    messages.push({ role: 'assistant', content: response.content })

    // If Claude is done (no tool calls), return the final text
    if (response.stop_reason === 'end_turn') {
      reply = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n')
      break
    }

    // Process tool calls
    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        // Enforce per-turn tool call cap
        toolCallCount++
        if (toolCallCount > MAX_TOOL_CALLS_PER_TURN) {
          throw new Error(`Tool call limit (${MAX_TOOL_CALLS_PER_TURN}) exceeded in a single turn`)
        }

        const toolName = block.name
        const input = block.input as Record<string, unknown>
        let result: unknown

        // Observability — log every tool call with duration
        const start = Date.now()
        console.log(`[${new Date().toISOString()}] tool_call: ${toolName}`, input)

        try {
          const run = () => executeTool(toolName, input)
          result = READ_TOOLS.has(toolName) ? await withRetry(run) : await run()
          console.log(`[${new Date().toISOString()}] tool_result: ${toolName} (${Date.now() - start}ms)`)
        } catch (err) {
          // Improved fallback — structured error Claude can explain to the user
          console.log(`[${new Date().toISOString()}] tool_error: ${toolName} (${Date.now() - start}ms)`, String(err))
          result = {
            error: `Tool ${toolName} failed: ${String(err)}`,
            suggestion: 'You may want to try again or rephrase your request.'
          }
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result)
        })
      }

      // Send tool results back to Claude and continue the loop
      messages.push({ role: 'user', content: toolResults })
    }
  }

  return { reply, history: messages }
}

async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  // Apply rate limiting before every Salesforce API call
  await sfRateLimiter.throttle()

  switch (name) {
    case 'get_tasks':
      return sf.getTasks({
        whatId: input.what_id as string | undefined,
        status: input.status as string | undefined
      })

    case 'get_opportunities':
      return sf.getOpportunities({
        stage: input.stage as string | undefined,
        accountName: input.account_name as string | undefined
      })

    case 'search_records':
      return sf.searchRecords(
        input.object_type as string,
        input.search_term as string
      )

    case 'get_record_details':
      return sf.getRecordDetails(
        input.object_type as string,
        input.id as string
      )

    case 'create_task':
      return sf.createTask(
        input.subject as string,
        (input.who_id as string) ?? null,
        (input.what_id as string) ?? null,
        input.due_date as string,
        input.description as string | undefined
      )

    case 'update_opportunity':
      return sf.updateOpportunity(input.id as string, {
        StageName: input.stage_name as string | undefined,
        Amount: input.amount as number | undefined,
        CloseDate: input.close_date as string | undefined
      })

    case 'create_contact':
      return sf.createContact(
        input.first_name as string,
        input.last_name as string,
        input.email as string,
        input.account_id as string
      )

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
