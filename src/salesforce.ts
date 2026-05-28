import jsforce from 'jsforce'
import dotenv from 'dotenv'
dotenv.config()

const conn = new jsforce.Connection({
  accessToken: process.env.SALESFORCE_ACCESS_TOKEN ?? '',
  instanceUrl: process.env.SALESFORCE_INSTANCE_URL ?? ''
})

export async function connect() {
  console.log('Connected to Salesforce via access token')
  return conn
}

// Search for records by name or keyword
export async function searchRecords(objectType: string, searchTerm: string) {
  await connect()
  const result = await conn.query(
    `SELECT Id, Name FROM ${objectType} WHERE Name LIKE '%${searchTerm}%' LIMIT 10`
  )
  return result.records
}

// Get full details of a specific record by ID
export async function getRecordDetails(objectType: string, id: string) {
  await connect()
  const record = await conn.sobject(objectType).retrieve(id)
  return record
}

// Get opportunities, optionally filtered by stage or account name
export async function getOpportunities(filters?: { stage?: string; accountName?: string }) {
  await connect()
  let query = 'SELECT Id, Name, StageName, Amount, CloseDate, Account.Name FROM Opportunity'
  const conditions: string[] = []

  if (filters?.stage) {
    conditions.push(`StageName = '${filters.stage}'`)
  }
  if (filters?.accountName) {
    conditions.push(`Account.Name LIKE '%${filters.accountName}%'`)
  }
  // Exclude closed deals by default unless a stage filter is specified
  if (!filters?.stage) {
    conditions.push(`StageName != 'Closed Won' AND StageName != 'Closed Lost'`)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  query += ' LIMIT 20'

  const result = await conn.query(query)
  return result.records
}

// Create a follow-up task linked to a record
export async function createTask(
  subject: string,
  whoId: string | null,    // Contact or Lead ID
  whatId: string | null,   // Account or Opportunity ID
  dueDate: string,         // Format: YYYY-MM-DD
  description?: string
) {
  await connect()
  const result = await conn.sobject('Task').create({
    Subject: subject,
    WhoId: whoId ?? undefined,
    WhatId: whatId ?? undefined,
    ActivityDate: dueDate,
    Description: description ?? '',
    Status: 'Not Started',
    Priority: 'Normal'
  })
  return result
}

// Update an opportunity's stage, amount, or close date
export async function updateOpportunity(
  id: string,
  fields: {
    StageName?: string
    Amount?: number
    CloseDate?: string
  }
) {
  await connect()
  const result = await conn.sobject('Opportunity').update({ Id: id, ...fields })
  return result
}

// Create a new contact linked to an account
export async function createContact(
  firstName: string,
  lastName: string,
  email: string,
  accountId: string
) {
  await connect()
  const result = await conn.sobject('Contact').create({
    FirstName: firstName,
    LastName: lastName,
    Email: email,
    AccountId: accountId
  })
  return result
}
