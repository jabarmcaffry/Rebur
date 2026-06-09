---
name: Hierarchy structure
description: The canonical container tree after the hard migration; no legacy names exist anywhere.
---

## ContainerName union (types.ts)
Workspace, Lighting, Players, Players/StarterInventory, Players/StarterData, Players/StarterCharacter,
UI, UI/Player, UI/Global, UI/Components,
Assets, Assets/Shared, Assets/Shared/Models, Assets/Shared/Audio, Assets/Shared/Textures, Assets/Shared/Animations, Assets/Shared/Data,
Assets/Server, Assets/Server/Models, Assets/Server/Audio, Assets/Server/Textures, Assets/Server/Animations, Assets/Server/Data,
Data, Data/Session, Data/Store,
Scripts, Scripts/Server, Scripts/Client, Scripts/Shared,
Teams, Chat, Network

## Removed
- `Players/StarterGui` — replaced by `UI` tree
- `Sound` (top-level container) — audio lives under `Assets/Shared/Audio` / `Assets/Server/Audio`
- `ReplicatedStorage` container name — replaced by `Assets/Shared`
- `ServerStorage` container name — replaced by `Assets/Server`

## API changes (script-runner.ts)
- `Rebur.ReplicatedStorage` → `Rebur.Assets.Shared`
- `Rebur.ServerStorage` → `Rebur.Assets.Server`
- Container filter helpers `isAssetsSharedObj(c)` and `isAssetsServerObj(c)` check all sub-folder names.

## Default script container
- `"ServerScriptService"` → `"Scripts/Server"` (in clientStorage.ts AND server/storage.ts)

**Why:** Hard migration; the user explicitly required NO legacy support, no backward compat code, no fallback container name mappings.
