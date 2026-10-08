export type Pulse = 'hidden' | 'waiting' | 'armed'

/** What survives a reload of the module (a file save). */
export type Saved = {
  enabled: boolean
  idle: number | null // this session's interval in ms; null follows the global one
  lastReal: number | null
  lastWarm: number | null
  lastRead: number | null // tokens the last beat read from the cache
  nextAt: number | null
  beats: number // in this session
  row: string | null // the latest turn's closing row, which carries the status line
  small: string | null // why the context is not kept warm, while it is under the minimum
}

/** How an event is told: a line in the transcript, a toast, both, or not at all. */
export type Alert = 'none' | 'log' | 'toast' | 'both'

/** The settings, global: kept in the plugin's store, shared by every session. */
export type BeatSettings = {
  defaultOn: boolean // new sessions start beating
  interval: number // minutes of idle before a beat
  intervalScope: 'session' | 'global' // what `/cachebeat <minutes>` changes
  stopAfterHours: number // since the last real turn
  stopAtUsage: number // percent of any rate-limit window
  skipSmall: boolean
  skipSmallTokens: number
  animate: boolean
  variant: string
  speed: 'slow' | 'normal' | 'fast' | number // a number: ms a frame
  timing: 'linear' | 'lubdub'
  heartPlacement: 'tail' | 'line'
  showCount: boolean
  color: string // 'dim', a theme key, a preset, or 'custom'
  customColor: string // #rrggbb
  effect: 'steady' | 'flash' | 'flow' | 'mixed'
  statusLine: 'below' | 'spaced' | 'off'
  showCountdown: boolean
  showTokens: boolean
  onBeat: Alert
  onStop: Alert
}

/** Where the settings pane is: a tab, and the row whose picker is open over it. */
export type PanePage = { tab: string; picker: keyof BeatSettings | null }

declare module 'claude-code' {
  /** The tools this plugin registers, as the model calls them; `parseSet` checks every value. */
  interface McpToolInputs {
    mcp__cachebeat__state: Record<string, never>
    mcp__cachebeat__set: {
      session?: { enabled?: boolean; intervalMinutes?: number | null }
      settings?: { [K in keyof BeatSettings]?: BeatSettings[K] | null } // null resets to the default
    }
  }
  interface PluginState {
    cachebeat: {
      pulse: Pulse
      saved: Saved | null
      frame: number
      line: string
      settings: BeatSettings
      tick: number // the settings pane's preview clock
      page: PanePage
      focus: string // the key of the pane's focused element, or ''
    }
  }
}
