# profiles/

Archived dsh profile configuration from the live deployment
(`/home/tomorrow285/.dsh/profiles/`).

| File | What it holds | Apply with |
|------|---------------|------------|
| `permission-presets.yml` | The full permission-preset table (read-only / workspace-write / danger-full-access / god-mode) | copy into a profile's `cordis.patch.yml`, or pass as `dsh --profile <name> --patch ./profiles/permission-presets.yml` |
