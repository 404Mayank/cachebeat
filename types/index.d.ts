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
  stretch: number // since the last turn
  row: string | null // the last turn's closing row, which carries the beat line
  rowsDone: Record<string, string> // earlier closing rows and the line each kept
}

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
  speed: 'slow' | 'normal' | 'fast'
  timing: 'linear' | 'lubdub'
  heartPlacement: 'tail' | 'line'
  showCount: boolean
  color: string // 'dim', a theme key, a preset, or 'custom'
  customColor: string // #rrggbb
  effect: 'steady' | 'flash' | 'flow'
  statusLine: 'below' | 'spaced' | 'inline' | 'off'
  showCountdown: boolean
  showTokens: boolean
  onBeat: 'none' | 'toast'
  sound: string // 'off' or a freedesktop sound id
  onStop: 'log' | 'toast' | 'none'
}

export type PanePage = 'main' | 'animations'

declare module 'claude-code' {
  interface PluginState {
    cachebeat: {
      pulse: Pulse
      saved: Saved | null
      frame: number
      line: string
      settings: BeatSettings
      tick: number // the settings pane's preview clock
      page: PanePage
    }
  }
}
