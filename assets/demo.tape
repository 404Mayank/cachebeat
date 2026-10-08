# Recorded by assets/demo.py, which turns this into assets/demo.gif.
# It forks the session it is pointed at, so the original transcript is left as it was,
# and hides your status line so the frame shows Claude Code and cachebeat alone.
Output assets/demo-raw.mp4

Set Shell "bash"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 16
Set Width 940
Set Height 820
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type `cd "$CACHEBEAT_DEMO_DIR" && for v in $(compgen -e | grep ^CLAUDE); do unset $v; done; clear && claude --resume "$CACHEBEAT_DEMO_SESSION" --fork-session --permission-mode default --settings '{"verbose":false,"statusLine":{"type":"command","command":"true"}}'` Enter
Sleep 9s
# One turn first: beats keep a warm cache warm, and a resumed session starts cold.
Type "In one short sentence: what is this project?" Enter
Sleep 30s
Show

# demo.py fast-forwards the still stretches, so the beats below land on their own.
Sleep 1s
Type "/cachebeat 2" Sleep 300ms Enter
Sleep 2s
# Two beats land on their own, two minutes apart.
Sleep 235s

Type "/cachebeat now" Sleep 300ms Enter
Sleep 3500ms

Type "/cachebeat settings" Sleep 300ms Enter
Sleep 1500ms
Type "2"
Sleep 1200ms
Enter
Sleep 1500ms
Down Sleep 1000ms
Down Sleep 1000ms
Down Sleep 1000ms
Down Sleep 600ms
Down Sleep 600ms
Down Sleep 600ms
Down Sleep 600ms
Down Sleep 600ms
Down Sleep 600ms
Down Sleep 600ms
Down Sleep 600ms
Down Sleep 600ms
Sleep 1000ms
Escape Sleep 400ms
Escape Sleep 400ms
Escape
Sleep 2500ms
