export type Pulse = 'hidden' | 'waiting' | 'armed'

/** What survives a reload of the module (a file save, a /config change). */
export type Saved = {
  enabled: boolean
  idle: number
  lastReal: number | null
  lastWarm: number | null
  nextAt: number | null
  beats: number // in this session
  stretch: number // since the last turn
  row: string | null // the last turn's closing row, which carries the beat line
  rowsDone: Record<string, string> // earlier closing rows and the line each kept
}

declare module 'claude-code' {
  interface PluginState {
    cachebeat: { pulse: Pulse; saved: Saved | null; frame: number; line: string }
  }
}
