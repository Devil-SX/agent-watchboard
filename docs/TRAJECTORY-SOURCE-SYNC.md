# Shared native-source uploader

The `TrajectorySourceSync` adapter triggers the installed Trajectory uploader at
`~/.local/lib/trajectory/trajectory_source_sync.py` with its single configuration
`~/.config/trajectory/source-sync.json`. Windows resolves the selected WSL distro
and home, then invokes the same command through `wsl.exe --exec` with an argument
array. No shell interpolation, credentials, HTTP client or checkpoint is added.

Apply `docs/patches/trajectory-source-sync-worker.patch` to the current trajectory
worker when integrating this adapter. The existing tick calls the adapter only
when synchronization is enabled. It does not await the child process: foreground
UI activity and existing statistical synchronization continue independently. One
in-flight child is permitted; the canonical CLI serializes against the timer and
Agent invocations using its OS lock and durable outbox.

Current deployed Sparkstead still sends statistical batches automatically. Its
running code cannot load this new adapter without a later software update; do not
claim it triggers native-source uploads now. Until that update, the separate
systemd timer supplies automatic native-source synchronization. Agents call the
same installed CLI and configuration directly. After the adapter is included in a
future Sparkstead release, both schedulers may safely trigger it; no second offset
or outbox is created.

Statistics and raw-source bytes intentionally have different transport offsets.
They retain exactly the same canonical collector/source identity. Native-source
upload does not create another usage ledger; the remote service parses content
and associates operations with the existing accounting records. Timer, Agent and
future Sparkstead native-source triggers all share one native-source checkpoint.
