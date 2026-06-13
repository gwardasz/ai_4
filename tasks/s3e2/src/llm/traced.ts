import { getPromptRef, startGeneration } from '../core/tracing/index.js'
import type { Logger } from '../core/logger.js'
import {
  chat,
  type ChatParams,
  type ResponsesApiResult,
  extractText,
  extractToolCalls,
  mapUsage,
  summarizeResponse,
} from './client.js'

export const chatTraced = async (
  params: ChatParams,
): Promise<ResponsesApiResult> => {
  const generation = startGeneration({
    model: params.model,
    input: params.input,
    prompt: getPromptRef(),
    metadata: {
      toolCount: params.tools?.length ?? 0,
    },
  })

  try {
    const response = await chat(params)
    generation.end({
      output: summarizeResponse(response),
      usage: mapUsage(response.usage),
    })
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    generation.error({ message })
    throw error
  }
}

export { extractText, extractToolCalls, mapUsage, summarizeResponse }
export type { ChatParams, FunctionCallOutput, ResponsesApiResult } from './client.js'
