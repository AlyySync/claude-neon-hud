export type TurnStats = {
  seconds: number
  tools: number
  errors: number
  startedAt: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'neon-hud': {
      turn: TurnStats
      bandHidden: boolean
      tick: number
    }
  }
}
