/**
 * Hand-maintained mirror of the DeepSeek Harness client surface this plugin
 * uses. Update it when the installed DSH exposes a different shape — query
 * `cordis_inspect_query` (Client `Slots`) for the live registration options.
 */

export interface TokenUsage {
  uncachedInputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  outputTokens: number
}

export interface SessionStats {
  turns: number
  steps: number
  llmMs: number
  toolMs: number
}

/** One row of the Chat snapshot the plugin reads. Only the fields used here. */
export interface ChatNode {
  kind?: string
  time?: number
  turn?: number
  callTime?: number
  name?: string
  timing?: { stepStartTime?: number | null; completedTime?: number }
  data?: {
    root?: { name?: string }
    name?: string
    toolName?: string
    isError?: boolean
    error?: unknown
  }
}

export interface SlotProps {
  sessionId: string
  useProjection(name: 'tokenUsage'): TokenUsage | undefined
  useProjection(name: 'sessionStats'): SessionStats | undefined
  useProjection<T>(name: string): T | undefined
  useChat<T>(selector: (snapshot: { legacy?: { nodes?: ChatNode[] } }) => T): T
  useSession<T>(selector: (snapshot: unknown) => T): T
}

export type Translate = (key: string, params?: Record<string, string | number>) => string

export interface LocaleService {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind(namespace: string): Translate
}

export interface SlotRegistration {
  name: string
  id: string
  order?: number
  label?: string | (() => string)
}

export interface ClientContext {
  get(name: 'locale'): LocaleService | undefined
  get(name: string): unknown
  effect(callback: () => (() => void) | void, label?: string): () => void
  slots: {
    inject(key: string, callback: () => () => void): () => void
    register(options: SlotRegistration, component: (props: SlotProps) => unknown): () => void
  }
}

export interface ModuleRegistration {
  id: string
  factory(require: (id: string) => unknown): unknown
}

declare global {
  interface Window {
    __ModuleLoader__: {
      load(registration: ModuleRegistration): void
    }
  }

  interface Navigator {
    clipboard?: { writeText(text: string): Promise<void> }
  }
}
