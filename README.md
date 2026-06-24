# NativeScript Windows Pokédex

A desktop Pokédex demo built with **NativeScript + Vue 3**, running natively on Windows via WinUI 3 / the Windows App SDK. It showcases the NativeScript Windows runtime — a virtualized, infinite-scrolling list of Pokémon with search, type filters, and a detail view.

> ⚠️ NativeScript for Windows is currently in **alpha**. Expect rough edges.

## Prerequisites

The app builds a real WinUI 3 desktop app with `dotnet build`, so you need the Windows toolchain in place before the CLI can run. These are the same requirements the NativeScript CLI's `ns doctor windows` checks for.

| Requirement | Notes |
|---|---|
| **Windows 10 1809 (build 17763) or later** | The app targets `net10.0-windows10.0.26100.0` with a minimum OS of `10.0.17763.0`. |
| **[Node.js](https://nodejs.org) (LTS)** | Provides `npm` / `npx`, used to install dependencies and drive the CLI. |
| **[.NET 10 SDK](https://dotnet.microsoft.com/download)** | The build invokes `dotnet build` / `dotnet publish`. Verify with `dotnet --version`. |
| **MSBuild on `PATH`** | Comes with the .NET SDK or Visual Studio. |
| **Developer Mode enabled** | Windows Settings → **Privacy & Security** → **For Developers** → turn on **Developer Mode**. Required so the unsigned debug build can be registered (`Add-AppxPackage -Register`) and launched locally. |

You do **not** need to install the NativeScript CLI globally — it's already a dev dependency of this project, and the npm scripts call it through `npx`. (If you prefer a global CLI, `npm install -g nativescript` also works.)

### One-time setup

```sh
# 1. Install the .NET 10 SDK from https://dotnet.microsoft.com/download
# 2. Enable Developer Mode (Windows Settings → Privacy & Security → For Developers)
```

## Quick start

```sh
npm install      # installs project deps, including the NativeScript CLI
npm run start    # prepare → build → deploy → launch on the local Windows machine
```

`npm run start` runs `ns run windows`: it builds the app in debug configuration (with the DevTools server on port 9229), deploys it, launches it, and watches your source for changes — saving a file live-syncs it into the running app.

## Scripts

| Script | Command | What it does |
|---|---|---|
| `npm run start` | `ns run windows` | Build, deploy, launch, and watch on the local Windows machine. |
| `npm run clean` | `ns clean` | Remove build artifacts and the `platforms/` directory for a fresh build. |

## Verifying your environment

If `npm run start` fails before the build, confirm the toolchain is set up correctly:

```sh
npx ns doctor windows
```

This reports whether the .NET SDK and the Windows App SDK workload are detected, and prints the exact command to fix anything that's missing.

## Project structure

```
src/
  app.ts                    # app entry point
  components/
    Home.vue                # root / navigation host
    PokeDex.vue             # virtualized Pokémon list (search + type filters)
    PokemonDetail.vue       # detail view
    Details.vue
  utils/pokemon.ts          # PokeAPI data helpers
App_Resources/Windows/      # Windows icons, splash, and manifest overrides
nativescript.config.ts      # app id (org.nativescript.nsPokedex) and platform config
```

## Troubleshooting

- **Build can't resolve the `net10.0-windows10.0.*` target framework** — this is provided by the .NET SDK, not a workload (there is no `windows` workload — only `maui-windows`, which this project doesn't use). Make sure you're on the **.NET 10 SDK** (`dotnet --version`) and let `dotnet build` restore the `Microsoft.WindowsAppSDK` / `Microsoft.Windows.SDK.BuildTools` NuGet packages.
- **App builds but won't launch / "deployment failed"** — make sure **Developer Mode** is on. The debug flow registers an unsigned package, which Windows blocks otherwise.
- **Stale or corrupted build** — run `npm run clean`, then `npm run start` again.
