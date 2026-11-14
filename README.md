# agmon-plugins

Open-source [AGMon](https://github.com/thanhdevapp/agent-factory) plugins, one
folder per plugin. Every plugin here is free and open source. It runs in the
AGMon plugin sandbox (opaque-origin iframe, no direct network access, no
`unsafe-eval`) and talks to the host only through the permissions its manifest
declares.

## Plugins

| Plugin | Folder | What it does |
| --- | --- | --- |
| Git Log | [`plugins/git-log`](plugins/git-log) | Git history for the workspace: branch tree, lane graph, filters, changed files and commit details |

## Install

In AGMon, open the Plugins panel and install the plugin from the catalog.
GitHub-sourced plugins must be enabled on the host with
`AGMON_PLUGIN_GITHUB_SOURCES=1`.

The installable tree is the plugin's folder in this repository at a pinned
commit. The catalog entry records the commit SHA and a SHA-256 of that tree, and
AGMon refuses to install anything that does not match.

## Permissions

Every permission is declared in the plugin's `agmon-extension.json` and is
reviewed by the user at install time.

| Permission | Why |
| --- | --- |
| `git:readHistory` | Read the workspace history, refs and commit details through the host |
| `theme:subscribe` | Follow the host light/dark theme |

The Git Log plugin asks the host to contact remotes only when the user presses
**Fetch**, and that request runs as `git fetch --dry-run`, so no reference is
changed.

## Develop

```bash
npm install
npx playwright install chromium
npm test                                  # plugin UI tests
```

The plugin folder is committed on purpose: it is what AGMon downloads and
hashes. Rebuild and commit it with every release, then update the catalog entry
with the new commit SHA and tree hash.

## License

MIT. See [LICENSE](LICENSE).
