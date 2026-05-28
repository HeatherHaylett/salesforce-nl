import { connect } from './salesforce'

async function test() {
  const conn = await connect()
  const result = await conn.query(
    `SELECT Id, Subject, Status, ActivityDate, WhatId, WhoId, Description
     FROM Task
     ORDER BY CreatedDate DESC
     LIMIT 5`
  )
  console.log('Recent tasks:', JSON.stringify(result.records, null, 2))
}

test().catch(console.error)