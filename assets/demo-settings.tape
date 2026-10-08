# Recorded by assets/demo.py after demo.tape, and joined on to its end. It is wider and taller,
# so the settings menu docks beside the transcript at full height, and is scaled down to match.
Output assets/demo-raw-settings.mp4

Set Shell "bash"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 16
Set Width 1200
Set Height 716
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 90ms

Hide
Type `cd "$CACHEBEAT_DEMO_DIR" && for v in $(compgen -e | grep ^CLAUDE); do unset $v; done; clear && claude --resume "$CACHEBEAT_DEMO_SESSION" --fork-session --permission-mode default --settings '{"verbose":false,"advisorModel":"","statusLine":{"type":"command","command":"true"}}'` Enter
Sleep 9s
Type "/cachebeat on" Enter
Sleep 2s
Show

Sleep 500ms
Type "/cachebeat settings" Sleep 500ms Enter
Sleep 1200ms
Type "2"
Sleep 1000ms
Enter
Sleep 2000ms
Down Sleep 700ms
Down Sleep 700ms
Down Sleep 700ms
Sleep 800ms
Escape Sleep 400ms
Escape Sleep 300ms
Escape
Sleep 1s
