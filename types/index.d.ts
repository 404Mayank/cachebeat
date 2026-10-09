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
  isCacheShort: boolean // a beat found this session's cache lasts five minutes, whatever its settings say
  paused: string | null // why beats wait for the next turn though the cache was warm: a model switch, a compaction
  warmModel: string | null // the model the last request ran on, whose cache a beat keeps warm
}

/** How long the main conversation's prompt cache lives. */
export type Ttl = '5m' | '1h'

/** How an event is told: a line in the transcript, a toast, both, or not at all. */
export type Alert = 'none' | 'log' | 'toast' | 'both'

export type Effect = 'steady' | 'flash' | 'flow' | 'mixed'
export type Speed = 'slow' | 'normal' | 'fast' | number // a number: ms a frame
export type Timing = 'linear' | 'lubdub'

/** How one part draws and moves: the heart under the prompt, or the turn line. */
export type Look = { color: string; customColor: string; effect: Effect; animate: boolean; speed: Speed; timing: Timing }

/** The settings, global: kept in the plugin's store, shared by every session. */
export type BeatSettings = {
  defaultOn: boolean // new sessions start beating
  interval: number | 'auto' // minutes of idle before a beat; auto fits the cache's lifetime
  intervalScope: 'session' | 'global' // what `/cachebeat <minutes>` changes
  stopAfterHours: number // since the last real turn
  stopAtUsage: number // percent of any rate-limit window
  skipSmall: boolean
  skipSmallTokens: number
  // the heart under the prompt
  heartPlacement: 'tail' | 'line'
  variant: string
  showCount: boolean
  heartColor: string // 'dim', a theme key, a preset, or 'custom'
  heartHex: string // #rrggbb, when heartColor is custom
  heartAnimate: boolean
  heartEffect: Effect
  heartSpeed: Speed
  heartTiming: Timing
  // the line under the latest turn
  statusLine: 'below' | 'spaced' | 'off'
  showCountdown: boolean
  showTokens: boolean
  statusHeart: string // what the heart starting the line plays: beat, off, or an animation's id
  lineColor: string
  lineHex: string
  lineAnimate: boolean
  lineEffect: Effect
  lineSpeed: Speed
  lineTiming: Timing
  onBeat: Alert
  onStop: Alert
  onModelSwitch: 'wait' | 'warm' // after /model while idle: wait for the next turn, or have the next beat write the new model's cache
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
      lineFrame: number // the turn line's own animation clock
      settings: BeatSettings
      tick: number // the settings pane's preview clock
      page: PanePage
      focus: string // the key of the pane's focused element, or ''
    }
  }
}
