# modes/

User-created dsh agent presets (模式), archived from the live deployment
(`/home/tomorrow285/.dsh/.agent-presets/`).

Each directory is a self-contained agent preset: `preset.yml` (name +
description metadata), `agent.cordis.yml` (the composition), and for
character presets a `character-card.json` + `character.md` pair.

| Directory | Mode name | Type |
|-----------|-----------|------|
| `tavern-mode/` | 酒馆模式 | mode-creator: interviews the user to design a new character and saves it as a new preset |
| `succubus-tavern/` | 魅魔酒馆模式 | succubus-oriented character workshop v2 |
| `character-k0mqf5/` | 糖糖 | character preset |
| `character-fo75d/` | 林晚晴 | character preset |
| `luoqixi/` | 洛琪希·米格路迪亚 | character preset |
| `character-a3d71b/` | 洛琪希二号 | character preset |

## Restore to dsh

Copy a preset directory back into `$DSH_HOME/.agent-presets/`, then pick it
in the Web UI mode selector (or set it as the default):

```sh
cp -r modes/tavern-mode "$DSH_HOME/.agent-presets/"
```

## Icons

dsh's mode selector renders a single generic icon for every preset (there is
no per-preset icon field in the metadata schema — only `name`, `description`,
`order`). Visual distinction is done via an emoji prefix in the preset
`name`, e.g. the permission preset `⚡ god-mode`.
