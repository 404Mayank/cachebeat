# Recorded by assets/demo.py, which turns this into assets/demo.gif.
# It forks the session it is pointed at, so the original transcript is left as it was.
# It loads this checkout's cachebeat (CACHEBEAT_DEMO_PLUGIN) and a demo mod (CACHEBEAT_DEMO_CLOCK) that runs
# cachebeat's clock fast and pins its settings to a new install's, with both installed copies off. Its settings
# pin Claude Code's dark theme and hide your status line, the advisor, turn durations, tips, thinking summaries,
# prompt suggestions and the away summary, so the frame shows Claude Code and cachebeat alone.
Output assets/demo-raw.mp4

Set Shell "bash"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 20
Set Width 1100
Set Height 640
Set Padding 20
Set Margin 16
Set MarginFill "#0d1117"
Set BorderRadius 10
Set TypingSpeed 50ms
Set Theme {"name":"cachebeat-gh","background":"#161b22","foreground":"#e6edf3","black":"#484f58","red":"#ff7b72","green":"#3fb950","yellow":"#d29922","blue":"#58a6ff","magenta":"#bc8cff","cyan":"#39c5cf","white":"#b1bac4","brightBlack":"#6e7681","brightRed":"#ffa198","brightGreen":"#56d364","brightYellow":"#e3b341","brightBlue":"#79c0ff","brightMagenta":"#d2a8ff","brightCyan":"#56d4dd","brightWhite":"#ffffff","cursor":"#e6edf3","selection":"#264f78"}

# Scene 0, hidden: beats in a fork wait for a turn in it, so one turn runs out of frame. Its first ● is the answer:
# the source has already read demo.sh, and the pattern starts at the typed question, not at the source's own lines.
Hide
Type `cd "$CACHEBEAT_DEMO_DIR" && for v in $(compgen -e | grep ^CLAUDE); do unset $v; done; clear && claude --resume "$CACHEBEAT_DEMO_SESSION" --fork-session --plugin-dir "$CACHEBEAT_DEMO_CLOCK" --plugin-dir "$CACHEBEAT_DEMO_PLUGIN" --model "${CACHEBEAT_DEMO_MODEL:-sonnet}" --permission-mode auto --settings '{"verbose":false,"theme":"dark","showTurnDuration":false,"spinnerTipsEnabled":false,"showThinkingSummaries":false,"awaySummaryEnabled":false,"remoteControlAtStartup":false,"crossSessionInbound":"refuse","promptSuggestionEnabled":false,"advisorModel":"","statusLine":{"type":"command","command":"true"},"enabledPlugins":{"cachebeat@cachebeat":false,"cachebeat@synced":false}}'` Enter
Sleep 9s
Type "in one line, what does demo.sh open?" Sleep 400ms Enter
Wait+Screen@60s /(?s)demo\.sh open\?.*●/
Sleep 3s
Show

# Scene 1: the opening frame, with cachebeat off.
Sleep 1500ms

# Scene 2: the demo mod's fast stretch starts with this command's first one-minute step.
Type "/cachebeat 3h" Sleep 400ms Enter
Wait+Screen@10s /next beat in/
Sleep 2s

# Scene 3: 50 idle minutes pass in seconds, twice, and both beats land on their own.
Wait+Screen@90s /kept warm ×2/
Sleep 1500ms

# Scene 4: the next message. The turn line comes back under the answer only once the turn has ended.
Sleep 500ms
Type "back. where were we?" Sleep 400ms Enter
Wait+Screen@40s /(?s)where were we\?.*kept warm ×2/
Sleep 2500ms
