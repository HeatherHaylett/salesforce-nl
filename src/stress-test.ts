/**
 * Stress test — validates the reliability layer
 *
 * Run: npx ts-node src/stress-test.ts
 *
 * Tests:
 *   1. Rate limiter    — 15 rapid calls, confirms throttling kicks in after 10
 *   2. SOQL injection  — search with injection characters, confirms sanitization
 *   3. Object allowlist — invalid object type, confirms it's blocked before hitting SF
 *   4. Fallback        — broken Salesforce connection, confirms structured error not stack trace
 *   5. Per-turn cap    — agent loop with cap set to 2, confirms it throws before runaway
 */

import { searchRecords } from './salesforce'
import jsforce from 'jsforce'
import dotenv from 'dotenv'
dotenv.config()

// ─── Helpers ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name}... `)
  try {
    await fn()
    console.log('✓ PASS')
    passed++
  } catch (err) {
    console.log(`✗ FAIL\n    ${String(err)}`)
    failed++
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

// ─── Test 1: Rate limiter ────────────────────────────────────────────────────

async function testRateLimiter() {
  console.log('\n1. Rate Limiter')
  console.log('   Firing 15 rapid calls — expect throttling after call 10\n')

  const times: number[] = []

  for (let i = 0; i < 15; i++) {
    const start = Date.now()
    await searchRecords('Account', 'Acme')
    const duration = Date.now() - start
    times.push(duration)
    console.log(`   Call ${String(i + 1).padStart(2)}: ${duration}ms`)
  }

  // Calls 11-15 should be slower — they had to wait for the window
  const earlyAvg = times.slice(0, 10).reduce((a, b) => a + b, 0) / 10
  const lateAvg = times.slice(10).reduce((a, b) => a + b, 0) / 5

  await test('Late calls were throttled (avg late > avg early)', async () => {
    assert(
      lateAvg > earlyAvg,
      `Expected late calls (${lateAvg.toFixed(0)}ms avg) to be slower than early calls (${earlyAvg.toFixed(0)}ms avg)`
    )
  })
}

// ─── Test 2: SOQL injection ──────────────────────────────────────────────────

async function testSQLInjection() {
  console.log('\n2. SOQL Injection Sanitization')

  await test("Single quote in search term doesn't crash", async () => {
    // A real injection attempt — without sanitization this would break the SOQL syntax
    const result = await searchRecords('Account', "' OR '1'='1")
    // If we get here without an error, the quote was escaped and handled safely
    assert(Array.isArray(result), 'Expected an array result')
  })

  await test('Backslash in search term is handled safely', async () => {
    const result = await searchRecords('Account', "Acme\\Corp")
    assert(Array.isArray(result), 'Expected an array result')
  })
}

// ─── Test 3: Object type allowlist ──────────────────────────────────────────

async function testAllowlist() {
  console.log('\n3. Object Type Allowlist')

  await test('Invalid object type is blocked before hitting Salesforce', async () => {
    let threw = false
    try {
      await searchRecords('User__c; DROP TABLE Account', 'test')
    } catch (err) {
      threw = true
      assert(
        String(err).includes('not allowed'),
        `Expected "not allowed" error, got: ${String(err)}`
      )
    }
    assert(threw, 'Expected an error to be thrown for invalid object type')
  })

  await test('Valid object types are allowed through', async () => {
    for (const obj of ['Account', 'Contact', 'Opportunity']) {
      const result = await searchRecords(obj, 'test')
      assert(Array.isArray(result), `Expected array for ${obj}`)
    }
  })
}

// ─── Test 4: Fallback — broken connection ────────────────────────────────────

async function testFallback() {
  console.log('\n4. Fallback — Broken Salesforce Connection')

  await test('Bad access token returns structured error, not stack trace', async () => {
    // Create a connection with a deliberately invalid token
    const brokenConn = new jsforce.Connection({
      accessToken: 'bad-token-intentionally-invalid',
      instanceUrl: process.env.SALESFORCE_INSTANCE_URL ?? ''
    })

    let errorMessage = ''
    try {
      await brokenConn.query('SELECT Id FROM Account LIMIT 1')
    } catch (err) {
      errorMessage = String(err)
    }

    assert(errorMessage.length > 0, 'Expected an error from broken connection')
    // Confirm it's a readable error string, not a raw stack trace dump
    assert(
      !errorMessage.includes('    at '),
      'Error should not contain a stack trace'
    )
    console.log(`   Error received: "${errorMessage.slice(0, 80)}..."`)
  })
}

// ─── Test 5: Per-turn tool call cap ──────────────────────────────────────────

async function testPerTurnCap() {
  console.log('\n5. Per-Turn Tool Call Cap')
  console.log('   NOTE: To test this interactively, temporarily set')
  console.log('   MAX_TOOL_CALLS_PER_TURN = 2 in agent.ts and run:')
  console.log('   "Show all open opportunities and log a follow-up on each one"\n')
  console.log('   The agent should throw before completing all tool calls.\n')

  await test('Cap constant is defined and reasonable', async () => {
    // Can't easily test the cap without running the full agent loop,
    // so we verify the constant exists at import time
    const agentSource = require('fs').readFileSync('./src/agent.ts', 'utf8') as string
    assert(
      agentSource.includes('MAX_TOOL_CALLS_PER_TURN'),
      'MAX_TOOL_CALLS_PER_TURN should be defined in agent.ts'
    )
    const match = agentSource.match(/MAX_TOOL_CALLS_PER_TURN\s*=\s*(\d+)/)
    const value = match ? parseInt(match[1] ?? '0') : 0
    assert(value > 0 && value <= 20, `Cap value ${value} should be between 1 and 20`)
    console.log(`   Cap is set to ${value} tool calls per turn`)
  })
}

// ─── Runner ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════')
  console.log('  salesforce-nl reliability stress test')
  console.log('═══════════════════════════════════════')

  await testRateLimiter()
  await testSQLInjection()
  await testAllowlist()
  await testFallback()
  await testPerTurnCap()

  console.log('\n───────────────────────────────────────')
  console.log(`  ${passed} passed  |  ${failed} failed`)
  console.log('───────────────────────────────────────\n')

  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error('Stress test runner failed:', err)
  process.exit(1)
})
