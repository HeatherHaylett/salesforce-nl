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

// Whitelist of allowed Salesforce object types — prevents object injection in FROM clause
const ALLOWED_OBJECTS = new Set(['Account', 'Contact', 'Opportunity', 'Task', 'Lead'])

function assertAllowedObject(objectType: string): void {
  if (!ALLOWED_OBJECTS.has(objectType)) {
    throw new Error(`Object type "${objectType}" is not allowed`)
  }
}

// Escape single quotes to prevent SOQL injection in WHERE clauses
function sanitize(value: string): string {
  return value.replace(/'/g, "\\'")
}

// Search for records by name or keyword
export async function searchRecords(objectType: string, searchTerm: string) {
  await connect()
  assertAllowedObject(objectType)
  const result = await conn.query(
    `SELECT Id, Name FROM ${objectType} WHERE Name LIKE '%${sanitize(searchTerm)}%' LIMIT 10`
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
    conditions.push(`StageName = '${sanitize(filters.stage)}'`)
  }
  if (filters?.accountName) {
    conditions.push(`Account.Name LIKE '%${sanitize(filters.accountName)}%'`)
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

// Get tasks, optionally filtered by account/opportunity or status
export async function getTasks(filters?: { whatId?: string; status?: string }) {
  await connect()
  let query = `SELECT Id, Subject, Status, ActivityDate, Description, What.Name
               FROM Task`
  const conditions: string[] = []

  if (filters?.whatId) {
    conditions.push(`WhatId = '${sanitize(filters.whatId)}'`)
  }
  if (filters?.status) {
    conditions.push(`Status = '${sanitize(filters.status)}'`)
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ')
  }
  query += ' ORDER BY ActivityDate DESC LIMIT 20'

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
