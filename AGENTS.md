# AGENTS.md

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues on `tonywxx/ada-charts`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: the five canonical triage roles, each using a label equal to its name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## AdaChart ownership

Implement all reusable AdaChart/AdaChartPro UI, interactions, styles, configuration, and candle-data adapters in `/Users/tony/github/ada-charts`. Consumers use the public component API and own only business selection, account/workspace state, storage, and transport policy. New chart features must work in a standalone AdaChartPro example and have focused coverage in ada-charts.
