import Anthropic from '@anthropic-ai/sdk'

export const tools: Anthropic.Tool[] = [
  {
    name: 'get_tasks',
    description:
      'Get a list of tasks (follow-ups, calls, to-dos) from Salesforce. Use when the user asks what tasks are open, what follow-ups are scheduled, or what activity is logged against a record.',
    input_schema: {
      type: 'object',
      properties: {
        what_id: {
          type: 'string',
          description: 'Filter tasks by the ID of a linked Account or Opportunity'
        },
        status: {
          type: 'string',
          description: 'Filter by task status: "Not Started", "In Progress", or "Completed"'
        }
      },
      required: []
    }
  },
  {
    name: 'search_records',
    description:
      'Search for Salesforce records by name or keyword. Use this when the user asks about accounts, contacts, or opportunities without providing a specific ID. Also use this to look up an ID before taking action on a record.',
    input_schema: {
      type: 'object',
      properties: {
        object_type: {
          type: 'string',
          enum: ['Account', 'Contact', 'Opportunity'],
          description: 'The type of Salesforce record to search'
        },
        search_term: {
          type: 'string',
          description: 'Name or keyword to search for'
        }
      },
      required: ['object_type', 'search_term']
    }
  },
  {
    name: 'get_opportunities',
    description:
      'Get a list of opportunities, optionally filtered by stage or account name. Use this when the user asks about deals, pipeline, or opportunities — especially with filters like "open", "closing this quarter", or for a specific account.',
    input_schema: {
      type: 'object',
      properties: {
        stage: {
          type: 'string',
          description:
            'Filter by stage name, e.g. "Prospecting", "Negotiation/Review", "Closed Won". Omit to get all open deals.'
        },
        account_name: {
          type: 'string',
          description: 'Filter opportunities by account name (partial match)'
        }
      },
      required: []
    }
  },
  {
    name: 'get_record_details',
    description:
      'Get full details of a specific Salesforce record by its ID. Use this after search_records to get the complete information about a record.',
    input_schema: {
      type: 'object',
      properties: {
        object_type: {
          type: 'string',
          enum: ['Account', 'Contact', 'Opportunity', 'Task'],
          description: 'The type of Salesforce record'
        },
        id: {
          type: 'string',
          description: 'The Salesforce record ID'
        }
      },
      required: ['object_type', 'id']
    }
  },
  {
    name: 'create_task',
    description:
      'Log a follow-up task in Salesforce linked to a contact or account. Use this when the user wants to schedule a call, meeting, or follow-up.',
    input_schema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Short title for the task, e.g. "Follow-up call — discussed pricing"'
        },
        what_id: {
          type: 'string',
          description: 'ID of the Account or Opportunity to link the task to'
        },
        who_id: {
          type: 'string',
          description: 'ID of the Contact or Lead to link the task to (optional)'
        },
        due_date: {
          type: 'string',
          description: 'Due date in YYYY-MM-DD format'
        },
        description: {
          type: 'string',
          description: 'Longer notes about the task (optional)'
        }
      },
      required: ['subject', 'due_date']
    }
  },
  {
    name: 'update_opportunity',
    description:
      'Update an opportunity\'s stage, amount, or close date. Use this when the user wants to move a deal forward or change its details.',
    input_schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The Salesforce Opportunity ID'
        },
        stage_name: {
          type: 'string',
          description:
            'New stage for the opportunity. Valid values: Prospecting, Qualification, Needs Analysis, Value Proposition, Proposal/Price Quote, Negotiation/Review, Closed Won, Closed Lost'
        },
        amount: {
          type: 'number',
          description: 'New dollar amount for the opportunity'
        },
        close_date: {
          type: 'string',
          description: 'New close date in YYYY-MM-DD format'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'create_contact',
    description:
      'Create a new contact in Salesforce linked to an account. Use this when the user wants to add a person to an existing account.',
    input_schema: {
      type: 'object',
      properties: {
        first_name: {
          type: 'string',
          description: 'Contact\'s first name'
        },
        last_name: {
          type: 'string',
          description: 'Contact\'s last name'
        },
        email: {
          type: 'string',
          description: 'Contact\'s email address'
        },
        account_id: {
          type: 'string',
          description: 'ID of the Account to link this contact to'
        }
      },
      required: ['first_name', 'last_name', 'account_id']
    }
  }
]
