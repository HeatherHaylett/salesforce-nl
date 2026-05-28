import Anthropic from '@anthropic-ai/sdk'
import { tools } from './tools'
import * as sf from './salesforce'

const client = new Anthropic()

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

        const toolName = block.name
        const input = block.input as Record<string, unknown>
        let result: unknown

        try {
          result = await executeTool(toolName, input)
        } catch (err) {
          result = { error: String(err) }
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
  switch (name) {
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
