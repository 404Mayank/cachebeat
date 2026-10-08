# Recorded by assets/demo.py, which turns this into assets/demo.gif.
# It forks the session it is pointed at, so the original transcript is left as it was,
# and hides your status line and the advisor so the frame shows Claude Code and cachebeat alone.
Output assets/demo-raw.mp4

Set Shell "bash"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 16
Set Width 940
Set Height 560
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 90ms

Hide
Type `cd "$CACHEBEAT_DEMO_DIR" && for v in $(compgen -e | grep ^CLAUDE); do unset $v; done; clear && claude --resume "$CACHEBEAT_DEMO_SESSION" --fork-session --plugin-dir "$CACHEBEAT_DEMO_CLOCK" --permission-mode default --settings '{"verbose":false,"advisorModel":"","statusLine":{"type":"command","command":"true"}}'` Enter
Sleep 9s
Show

Sleep 1s
Type "in one line, what's in this folder?" Sleep 500ms Enter
Sleep 3500ms

# The demo clock runs 50 idle minutes in 10 seconds, so both beats land on their own.
Type "/cachebeat on" Sleep 500ms Enter
Wait+Screen@90s /kept warm ×2/
Sleep 1500ms

# The clock is back to normal by now: this interval shows, and never beats.
Type "/cachebeat 5" Sleep 500ms Enter
Sleep 2500ms
