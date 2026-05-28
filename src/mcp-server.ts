/**
 * Salesforce MCP Server
 *
 * Exposes the same Salesforce operations as the CLI agent, but as an MCP server.
 * This makes the tools available to any Claude-powered app — Claude Code,
 * Claude.ai, or a custom agent — not just this CLI.
 *
 * The Salesforce functions are identical to the CLI agent — MCP is just
 * the transport layer that makes them reusable across applications.
 *
 * Usage:
 *   npx ts-node src/mcp-server.ts
 *
 * Then connect from Claude Code:
 *   Add to .claude/mcp_servers.json:
 *   {
 *     "salesforce": {
 *       "command": "npx",
 *       "args": ["ts-node", "/path/to/src/mcp-server.ts"]
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import * as sf from './salesforce'

const server = new Server(
  { name: 'salesforce-nl', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

// Expose the same tools as the CLI agent
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_tasks',
      description: 'Get tasks from Salesforce, optionally filtered by linked record or status.',
      inputSchema: {
        type: 'object',
        properties: {
          what_id: { type: 'string', description: 'Filter by linked Account or Opportunity ID' },
          status: { type: 'string', description: 'Filter by status: Not Started, In Progress, Completed' }
        }
      }
    },
    {
      name: 'get_opportunities',
      description: 'List open opportunities, optionally filtered by stage or account name.',
      inputSchema: {
        type: 'object',
        properties: {
          stage: { type: 'string', description: 'Filter by stage name' },
          account_name: { type: 'string', description: 'Filter by account name (partial match)' }
        }
      }
    },
    {
      name: 'search_records',
      description: 'Search for Accounts, Contacts, or Opportunities by name.',
      inputSchema: {
        type: 'object',
        properties: {
          object_type: { type: 'string', enum: ['Account', 'Contact', 'Opportunity'] },
          search_term: { type: 'string' }
        },
        required: ['object_type', 'search_term']
      }
    },
    {
      name: 'create_task',
      description: 'Log a follow-up task linked to an account or contact.',
      inputSchema: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          what_id: { type: 'string' },
          who_id: { type: 'string' },
          due_date: { type: 'string', description: 'YYYY-MM-DD' },
          description: { type: 'string' }
        },
        required: ['subject', 'due_date']
      }
    },
    {
      name: 'update_opportunity',
      description: "Update an opportunity's stage, amount, or close date.",
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          stage_name: { type: 'string' },
          amount: { type: 'number' },
          close_date: { type: 'string' }
        },
        required: ['id']
      }
    },
    {
      name: 'create_contact',
      description: 'Create a new contact linked to an account.',
      inputSchema: {
        type: 'object',
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          email: { type: 'string' },
          account_id: { type: 'string' }
        },
        required: ['first_name', 'last_name', 'account_id']
      }
    }
  ]
}))

// Route tool calls to the same Salesforce functions used by the CLI agent
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params
  const input = args as Record<string, unknown>

  try {
    let result: unknown

    switch (name) {
      case 'get_tasks':
        result = await sf.getTasks({
          whatId: input.what_id as string | undefined,
          status: input.status as string | undefined
        })
        break
      case 'get_opportunities':
        result = await sf.getOpportunities({
          stage: input.stage as string | undefined,
          accountName: input.account_name as string | undefined
        })
        break
      case 'search_records':
        result = await sf.searchRecords(input.object_type as string, input.search_term as string)
        break
      case 'create_task':
        result = await sf.createTask(
          input.subject as string,
          (input.who_id as string) ?? null,
          (input.what_id as string) ?? null,
          input.due_date as string,
          input.description as string | undefined
        )
        break
      case 'update_opportunity':
        result = await sf.updateOpportunity(input.id as string, {
          StageName: input.stage_name as string | undefined,
          Amount: input.amount as number | undefined,
          CloseDate: input.close_date as string | undefined
        })
        break
      case 'create_contact':
        result = await sf.createContact(
          input.first_name as string,
          input.last_name as string,
          input.email as string,
          input.account_id as string
        )
        break
      default:
        throw new Error(`Unknown tool: ${name}`)
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${String(err)}` }],
      isError: true
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Salesforce MCP server running on stdio')
}

main().catch(console.error)
