import * as readline from 'readline'
import { runAgent } from './agent'
import type Anthropic from '@anthropic-ai/sdk'

type Message = Anthropic.MessageParam

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function prompt(question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve))
}

async function main() {
  console.log('Salesforce Assistant — type your question or command.')
  console.log('Type "exit" to quit.\n')

  let history: Message[] = []

  while (true) {
    const userInput = await prompt('You: ')

    if (userInput.trim().toLowerCase() === 'exit') {
      console.log('Goodbye.')
      rl.close()
      break
    }

    if (!userInput.trim()) continue

    try {
      const { reply, history: updatedHistory } = await runAgent(userInput, history)
      history = updatedHistory
      console.log(`\nAssistant: ${reply}\n`)
    } catch (err) {
      console.error('Error:', err)
    }
  }
}

main()
