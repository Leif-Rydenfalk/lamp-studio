# ce-net cells

The workspace where ce-net's cells are built: every capability is a typed function over the network, every cell is a
types-only `-api` crate plus a process, and the rules are enforced by a command that fails.

**This is the ce-net default, not a local style.** All new and converted cells follow the canonical
[`ce-net/cell-architecture`](https://github.com/ce-net/cell-architecture); a cell that predates it reaches the default
through an adapter cell, not a rewrite. The canonical check runs anywhere:
`make -C cell-architecture check CELLS=path/to/cells`.

Start here, in this order:

| | |
|---|---|
| **[QUICKSTART.md](QUICKSTART.md)** | five minutes to a working cell — the loop, scaffolding, running one |
| **[CORE-DESIGN.md](CORE-DESIGN.md)** | the core design: cell shape, the capability model, versions and adapters, the core library, the rules |
| **[ce-net/cell-architecture](https://github.com/ce-net/cell-architecture)** | the canonical, network-wide copy of the rules, with the Rust check and the adapter path |
| **[AGENTS.md](AGENTS.md)** | the rules for an agent working in this tree (read before you change anything) |
| **[FIELD-NOTES.md](FIELD-NOTES.md)** | what building the door from the agent side cost, and the rules it produced |
| **[AUTH.md](AUTH.md)** | auth ergonomics: `whoami` must report the tier; two tools instead of five OAuth steps |
| **[docs/ACCOUNT-LINKING.md](docs/ACCOUNT-LINKING.md)** | sign-up, sign-in and linking a person across providers, with the failure contract |
| **[SECURITY-FIX.md](SECURITY-FIX.md)** | an agent key reaching account resources: the hole, the patch, the three tiers |
| **[REPOS.md](REPOS.md)** | the six repos, their commits, and what publishing needs |

```bash
export CARGO_HOME=$PWD/doc-store/.cargo-home   # the default cache is outside this workspace
make demo      # the whole system, proved: versions + adapter, the rule, golden outputs
make test      # 73 tests, ~4 s warm
make cells     # the architecture rule, as a failing check
```

## The one rule

A cell is **two crates and a manifest**: a types-only `-api` crate other cells may import, a process nobody imports, and
a `cell.toml` with a declared version. A capability is a function across that boundary — `In -> Out`, typed at both
ends, addressed `api@major`, gated by a right. Composition returns a capability, so chains are capabilities and the
model recurses, with cycle and depth guards.

## The cells

| repo | api | what |
|---|---|---|
| `cell-core` | library | schema versioning, the call contract, rollback, auth chains |
| `chain` | library | the capability algebra, versions, adapters |
| `doc-store` | `doc.store@1` | documents addressed by content, links, names |
| `talk-hub` | `talk.hub@1` | channels, DMs, the shared build queue |
| `ledger-call` | `ledger.call@1` | one append-only row per call |
| `notes-pad` | `notes.pad@1` | scaffolded by `tools/new-cell.py` |
| `street-lamp` | `street.lamp@1` | one real Berlin lamp, its geometry and its state |

## Street cells and one renderer

A real 250 m of 华发路 in Huaqiangbei is cut into five 50 m `street.segment` cells, one process each, plus a
`street.directory` that only holds identities and bounds. A car leaving a cell is a typed `Ingress` call to the
neighbour on that side; a cell added later is discovered without a restart. `render.scene/1` and `render-web/` are the
one renderer: nodes, bounds, LOD and interest, not a local page plus a sandbox page.

```bash
make street-build
make street-demo          # http://127.0.0.1:8080
make render-check        # while the demo runs
```

Read [docs/STREET-TWIN.md](docs/STREET-TWIN.md) and [render-protocol/README.md](render-protocol/README.md).

**One lamp, the cell renderer.** `street.lamp@1` serves one real Berlin asset; the stateless `lamp-gateway`
turns its typed answer into a `render.scene/1` studio; `render-web` draws it. No street, no chart, no sandbox.

```bash
make lamp-demo          # http://127.0.0.1:8090/
```

The snapshot of the same scene is at <https://leif-rydenfalk.github.io/lamp-studio/>.

