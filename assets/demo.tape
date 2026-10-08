# Recorded by assets/demo.py, which turns this into assets/demo.gif.
# It forks the session it is pointed at, so the original transcript is left as it was,
# and hides your status line and the advisor so the frame shows Claude Code and cachebeat alone;
# verbose mode stays on for the token count above the prompt.
Output assets/demo-raw.mp4

Set Shell "bash"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 20
Set Width 1176
Set Height 700
Set Padding 22
Set Theme "Catppuccin Mocha"
Set TypingSpeed 90ms

Hide
Type `cd "$CACHEBEAT_DEMO_DIR" && for v in $(compgen -e | grep ^CLAUDE); do unset $v; done; clear && claude --resume "$CACHEBEAT_DEMO_SESSION" --fork-session --plugin-dir "$CACHEBEAT_DEMO_CLOCK" --permission-mode default --settings '{"verbose":true,"advisorModel":"","statusLine":{"type":"command","command":"true"}}'` Enter
Sleep 9s
Show

Sleep 1s
Type "in one line, which board is this sketch for?" Sleep 500ms Enter
Sleep 3500ms

# The demo clock runs 50 idle minutes in 10 seconds, so both beats land on their own.
Type "/cachebeat on" Sleep 500ms Enter
Wait+Screen@90s /kept warm ×2/
Sleep 1500ms

# The clock is back to normal by now: this interval shows, and never beats.
Type "/cachebeat 5" Sleep 500ms Enter
Sleep 2500ms

Type "/cachebeat settings" Sleep 500ms Enter
Sleep 1200ms
Type "2"
Sleep 1000ms
Enter
Sleep 1500ms
Down Sleep 600ms
Down Sleep 600ms
Down Sleep 600ms
Down Sleep 600ms
Down Sleep 600ms
Sleep 800ms
Escape Sleep 400ms
Escape Sleep 300ms
Escape
Sleep 1s
