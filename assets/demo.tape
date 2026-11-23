# Recorded by assets/demo.py, which turns this into assets/demo.gif.
# It forks the session it is pointed at, so the original transcript is left as it was. That session
# last answered hours ago, so the fork's cache is cold and the guard asks before the first message goes.
# It loads this checkout's cachebeat (CACHEBEAT_DEMO_PLUGIN) and a clock mod (CACHEBEAT_DEMO_CLOCK), with
# both installed copies off, and hides your status line and the advisor so the frame shows
# Claude Code and cachebeat alone; verbose mode stays on for the token count above the prompt.
Output assets/demo-raw.mp4

Set Shell "bash"
Set FontFamily "FiraCode Nerd Font Mono"
Set FontSize 20
Set Width 1176
Set Height 700
Set Padding 22
Set Theme "Catppuccin Mocha"
Set TypingSpeed 70ms

# Scene 0, hidden: the fork's last screenful ends with a "Remote Control disconnected" notice from the account,
# so the frame opens on the guard's question instead. A bare /cachebeat first pushes the notice off the top, and the
# question is typed out of frame; Show comes when the question is up.
Hide
Type `cd "$CACHEBEAT_DEMO_DIR" && for v in $(compgen -e | grep ^CLAUDE); do unset $v; done; clear && claude --resume "$CACHEBEAT_DEMO_SESSION" --fork-session --plugin-dir "$CACHEBEAT_DEMO_CLOCK" --plugin-dir "$CACHEBEAT_DEMO_PLUGIN" --model "${CACHEBEAT_DEMO_MODEL:-sonnet}" --permission-mode default --settings '{"verbose":true,"advisorModel":"","statusLine":{"type":"command","command":"true"},"enabledPlugins":{"cachebeat@cachebeat":false,"cachebeat@synced":false}}'` Enter
Sleep 9s
Type "/cachebeat" Sleep 500ms Enter
Wait+Screen@10s /Cache\s+cold/
Escape
Sleep 500ms
Type "in one line, which board is this sketch for?" Sleep 500ms Enter
Wait+Screen@20s /Don't send/
Show

# Scene 1: the cache is cold, so the guard asks first.
Sleep 2500ms

# Scene 1b: Send has the focus. The answer re-caches the whole conversation, and it is the turn beats need.
Enter
Wait+Screen@10s /sent on a cold cache/
# The cachebeat line prints above the new turn, so this skips the source's own last "done 9:40 AM".
Wait+Screen@40s /(?s)sent on a cold cache.*done \d+:\d+ [AP]M/
Sleep 2s

# Scene 3: cachebeat is off until now, so the clock mod's fast stretch starts with this command's first step.
Type "/cachebeat 2h" Sleep 500ms Enter
Wait+Screen@10s /next beat in/

# Scene 3b: the clock mod runs 50 idle minutes in 10 seconds, so both beats land on their own.
Wait+Screen@90s /kept warm ×2/
Sleep 1500ms

# Scene 4: bare /cachebeat opens Status, on the Cache row first.
Type "/cachebeat" Sleep 500ms Enter
Wait+Screen@5s /Cache\s+warm/
Sleep 3s
Escape
Sleep 1s
