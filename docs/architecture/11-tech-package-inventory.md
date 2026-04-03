# Tech and Package Inventory

## Scope

This inventory is generated from source imports because the snapshot does not include a `package.json`.

- Files scanned: **1884** TypeScript/TSX files
- External package roots detected: **132**
- Method: static import/require/import() parsing across `.ts` and `.tsx` files
- Counts are approximate import usage counts, not runtime execution counts

## Folder Coverage

| Top-Level Family | TS/TSX Files |
|---|---:|
| `utils` | 564 |
| `components` | 389 |
| `commands` | 189 |
| `tools` | 184 |
| `services` | 130 |
| `hooks` | 104 |
| `ink` | 96 |
| `bridge` | 31 |
| `constants` | 21 |
| `skills` | 20 |
| `cli` | 19 |
| `(root)` | 18 |
| `keybindings` | 14 |
| `tasks` | 12 |
| `migrations` | 11 |
| `types` | 11 |
| `context` | 9 |
| `memdir` | 8 |
| `entrypoints` | 8 |
| `state` | 6 |
| `buddy` | 6 |
| `vim` | 5 |
| `remote` | 4 |
| `native-ts` | 4 |
| `query` | 4 |
| `server` | 3 |
| `screens` | 3 |
| `plugins` | 2 |
| `upstreamproxy` | 2 |
| `coordinator` | 1 |
| `schemas` | 1 |
| `bootstrap` | 1 |
| `moreright` | 1 |
| `outputStyles` | 1 |
| `assistant` | 1 |
| `voice` | 1 |

## Technology Categories

### Core Runtime and CLI

| Package | Files | Imports | Sample Files |
|---|---:|---:|---|
| `bun:bundle` | 196 | 196 | `services/analytics/metadata.ts`<br/>`services/teamMemorySync/teamMemSecretGuard.ts` |
| `@commander-js/extra-typings` | 3 | 3 | `commands/mcp/addCommand.ts`<br/>`commands/mcp/xaaIdpCommand.ts` |
| `signal-exit` | 2 | 2 | `ink/ink.tsx`<br/>`utils/gracefulShutdown.ts` |
| `bun:ffi` | 1 | 2 | `upstreamproxy/upstreamproxy.ts` |

### UI and Terminal Rendering

| Package | Files | Imports | Sample Files |
|---|---:|---:|---|
| `react` | 642 | 1151 | `services/claudeAiLimitsHook.ts`<br/>`services/mcpServerApproval.tsx` |
| `figures` | 89 | 89 | `services/diagnosticTracking.ts`<br/>`services/plugins/pluginCliCommands.ts` |
| `chalk` | 47 | 47 | `services/tips/tipRegistry.ts`<br/>`cost-tracker.ts` |
| `usehooks-ts` | 14 | 14 | `hooks/useInboxPoller.ts`<br/>`hooks/usePasteHandler.ts` |
| `strip-ansi` | 12 | 12 | `QueryEngine.ts`<br/>`hooks/useTextInput.ts` |
| `@alcalzone/ansi-tokenize` | 5 | 5 | `ink/screen.ts`<br/>`utils/textHighlighting.ts` |
| `marked` | 5 | 5 | `commands/copy/copy.tsx`<br/>`utils/claudemd.ts` |
| `qrcode` | 5 | 5 | `commands/session/session.tsx`<br/>`commands/mobile/mobile.tsx` |
| `react-reconciler` | 4 | 5 | `ink/render-to-screen.ts`<br/>`ink/reconciler.ts` |
| `fuse.js` | 3 | 3 | `hooks/unifiedSuggestions.ts`<br/>`utils/suggestions/commandSuggestions.ts` |
| `highlight.js` | 2 | 5 | `native-ts/color-diff/index.ts`<br/>`utils/cliHighlight.ts` |
| `cli-highlight` | 1 | 3 | `utils/cliHighlight.ts` |
| `asciichart` | 1 | 1 | `components/Stats.tsx` |
| `auto-bind` | 1 | 1 | `ink/ink.tsx` |
| `bidi-js` | 1 | 1 | `ink/bidi.ts` |
| `cli-boxes` | 1 | 1 | `ink/render-border.ts` |
| `code-excerpt` | 1 | 1 | `ink/components/ErrorOverview.tsx` |
| `emoji-regex` | 1 | 1 | `ink/stringWidth.ts` |
| `get-east-asian-width` | 1 | 1 | `ink/stringWidth.ts` |
| `indent-string` | 1 | 1 | `ink/render-node-to-output.ts` |
| `ink` | 1 | 1 | `ink/hooks/use-input.ts` |
| `supports-hyperlinks` | 1 | 1 | `ink/supports-hyperlinks.ts` |
| `wrap-ansi` | 1 | 1 | `ink/wrapAnsi.ts` |

### API and Model Providers

| Package | Files | Imports | Sample Files |
|---|---:|---:|---|
| `@anthropic-ai/sdk` | 116 | 135 | `services/api/logging.ts`<br/>`services/api/claude.ts` |
| `axios` | 59 | 62 | `services/analytics/firstPartyEventLoggingExporter.ts`<br/>`services/analytics/datadog.ts` |
| `undici` | 2 | 6 | `utils/proxy.ts`<br/>`utils/mtls.ts` |
| `@anthropic-ai/sandbox-runtime` | 1 | 2 | `utils/sandbox/sandbox-adapter.ts` |
| `@anthropic-ai/bedrock-sdk` | 1 | 1 | `services/api/client.ts` |
| `@anthropic-ai/claude-agent-sdk` | 1 | 1 | `cli/print.ts` |
| `@anthropic-ai/foundry-sdk` | 1 | 1 | `services/api/client.ts` |
| `@anthropic-ai/vertex-sdk` | 1 | 1 | `services/api/client.ts` |

### MCP and Remote Integrations

| Package | Files | Imports | Sample Files |
|---|---:|---:|---|
| `@modelcontextprotocol/sdk` | 25 | 44 | `services/mcp/auth.ts`<br/>`services/mcp/SdkControlTransport.ts` |
| `@ant/computer-use-mcp` | 7 | 10 | `utils/computerUse/wrapper.tsx`<br/>`utils/computerUse/gates.ts` |
| `ws` | 6 | 8 | `remote/SessionsWebSocket.ts`<br/>`services/voiceStreamSTT.ts` |
| `@ant/claude-for-chrome-mcp` | 4 | 4 | `services/mcp/client.ts`<br/>`skills/bundled/claudeInChrome.ts` |
| `@anthropic-ai/mcpb` | 2 | 4 | `utils/plugins/mcpbHandler.ts`<br/>`utils/dxt/helpers.ts` |
| `p-map` | 2 | 2 | `services/mcp/client.ts`<br/>`cli/handlers/mcp.tsx` |
| `xss` | 2 | 2 | `services/mcp/auth.ts`<br/>`services/mcp/xaaIdpLogin.ts` |
| `@ant/computer-use-input` | 1 | 2 | `utils/computerUse/inputLoader.ts` |
| `@ant/computer-use-swift` | 1 | 2 | `utils/computerUse/swiftLoader.ts` |

### Observability and Telemetry

| Package | Files | Imports | Sample Files |
|---|---:|---:|---|
| `@opentelemetry/api` | 10 | 10 | `services/analytics/firstPartyEventLoggingExporter.ts`<br/>`entrypoints/init.ts` |
| `@opentelemetry/sdk-logs` | 4 | 4 | `services/analytics/firstPartyEventLogger.ts`<br/>`services/analytics/firstPartyEventLoggingExporter.ts` |
| `@opentelemetry/api-logs` | 3 | 3 | `services/analytics/firstPartyEventLogger.ts`<br/>`utils/telemetry/instrumentation.ts` |
| `@opentelemetry/sdk-metrics` | 3 | 3 | `utils/telemetry/instrumentation.ts`<br/>`utils/telemetry/bigqueryExporter.ts` |
| `@opentelemetry/core` | 2 | 2 | `services/analytics/firstPartyEventLoggingExporter.ts`<br/>`utils/telemetry/bigqueryExporter.ts` |
| `@opentelemetry/resources` | 2 | 2 | `services/analytics/firstPartyEventLogger.ts`<br/>`utils/telemetry/instrumentation.ts` |
| `@opentelemetry/sdk-trace-base` | 2 | 2 | `utils/telemetry/instrumentation.ts`<br/>`bootstrap/state.ts` |
| `@opentelemetry/semantic-conventions` | 2 | 2 | `services/analytics/firstPartyEventLogger.ts`<br/>`utils/telemetry/instrumentation.ts` |
| `@opentelemetry/exporter-logs-otlp-http` | 1 | 2 | `utils/telemetry/instrumentation.ts` |
| `@opentelemetry/exporter-trace-otlp-http` | 1 | 2 | `utils/telemetry/instrumentation.ts` |
| `@growthbook/growthbook` | 1 | 1 | `services/analytics/growthbook.ts` |
| `@opentelemetry/exporter-logs-otlp-grpc` | 1 | 1 | `utils/telemetry/instrumentation.ts` |
| `@opentelemetry/exporter-logs-otlp-proto` | 1 | 1 | `utils/telemetry/instrumentation.ts` |
| `@opentelemetry/exporter-metrics-otlp-grpc` | 1 | 1 | `utils/telemetry/instrumentation.ts` |
| `@opentelemetry/exporter-metrics-otlp-http` | 1 | 1 | `utils/telemetry/instrumentation.ts` |
| `@opentelemetry/exporter-metrics-otlp-proto` | 1 | 1 | `utils/telemetry/instrumentation.ts` |
| `@opentelemetry/exporter-prometheus` | 1 | 1 | `utils/telemetry/instrumentation.ts` |
| `@opentelemetry/exporter-trace-otlp-grpc` | 1 | 1 | `utils/telemetry/instrumentation.ts` |
| `@opentelemetry/exporter-trace-otlp-proto` | 1 | 1 | `utils/telemetry/instrumentation.ts` |

### Cloud and Auth Providers

| Package | Files | Imports | Sample Files |
|---|---:|---:|---|
| `@aws-sdk/client-bedrock-runtime` | 2 | 3 | `services/tokenEstimation.ts`<br/>`utils/model/bedrock.ts` |
| `@smithy/node-http-handler` | 2 | 3 | `utils/proxy.ts`<br/>`utils/model/bedrock.ts` |
| `google-auth-library` | 2 | 3 | `services/api/client.ts`<br/>`utils/auth.ts` |
| `https-proxy-agent` | 2 | 2 | `utils/telemetry/instrumentation.ts`<br/>`utils/proxy.ts` |
| `@aws-sdk/client-bedrock` | 1 | 3 | `utils/model/bedrock.ts` |
| `@smithy/core` | 1 | 2 | `utils/model/bedrock.ts` |
| `@aws-sdk/client-sts` | 1 | 1 | `utils/aws.ts` |
| `@aws-sdk/credential-provider-node` | 1 | 1 | `utils/proxy.ts` |
| `@aws-sdk/credential-providers` | 1 | 1 | `utils/aws.ts` |
| `@azure/identity` | 1 | 1 | `services/api/client.ts` |

### Native and Media Bindings

| Package | Files | Imports | Sample Files |
|---|---:|---:|---|
| `image-processor-napi` | 2 | 3 | `utils/imagePaste.ts`<br/>`tools/FileReadTool/imageProcessor.ts` |
| `sharp` | 2 | 3 | `tools/FileReadTool/imageProcessor.ts`<br/>`tools/FileReadTool/FileReadTool.ts` |
| `audio-capture-napi` | 1 | 2 | `services/voice.ts` |
| `modifiers-napi` | 1 | 2 | `utils/modifiers.ts` |
| `audio-capture.node` | 1 | 1 | `hooks/useVoice.ts` |
| `color-diff-napi` | 1 | 1 | `components/StructuredDiff/colorDiff.ts` |
| `url-handler-napi` | 1 | 1 | `utils/deepLink/protocolHandler.ts` |

### Node/Bun Built-ins

| Package | Files | Imports | Sample Files |
|---|---:|---:|---|
| `path` | 252 | 258 | `projectOnboardingState.ts`<br/>`services/analytics/metadata.ts` |
| `fs` | 169 | 202 | `services/analytics/firstPartyEventLoggingExporter.ts`<br/>`services/teamMemorySync/index.ts` |
| `crypto` | 117 | 127 | `remote/remotePermissionBridge.ts`<br/>`remote/SessionsWebSocket.ts` |
| `os` | 59 | 59 | `screens/REPL.tsx`<br/>`commands/copy/copy.tsx` |
| `child_process` | 24 | 25 | `services/voice.ts`<br/>`services/lsp/LSPClient.ts` |
| `url` | 17 | 17 | `services/mcp/auth.ts`<br/>`services/mcp/xaaIdpLogin.ts` |
| `util` | 7 | 7 | `utils/getWorktreePathsPortable.ts`<br/>`ink/ink.tsx` |
| `http` | 6 | 7 | `services/voiceStreamSTT.ts`<br/>`services/mcp/auth.ts` |
| `stream` | 6 | 6 | `cli/remoteIO.ts`<br/>`ink/root.ts` |
| `async_hooks` | 5 | 5 | `utils/workloadContext.ts`<br/>`utils/agentContext.ts` |
| `net` | 4 | 4 | `services/oauth/auth-code-listener.ts`<br/>`utils/ide.ts` |
| `process` | 4 | 4 | `cli/handlers/util.tsx`<br/>`cli/handlers/mcp.tsx` |
| `buffer` | 3 | 3 | `ink/parse-keypress.ts`<br/>`ink/termio/osc.ts` |
| `readline` | 2 | 3 | `bridge/bridgeMain.ts`<br/>`bridge/sessionRunner.ts` |
| `tls` | 2 | 3 | `utils/mtls.ts`<br/>`utils/caCerts.ts` |
| `dns` | 2 | 2 | `utils/proxy.ts`<br/>`utils/hooks/ssrfGuard.ts` |
| `events` | 2 | 2 | `ink/events/emitter.ts`<br/>`utils/abortController.ts` |
| `https` | 1 | 2 | `utils/mtls.ts` |
| `perf_hooks` | 1 | 2 | `utils/profilerBase.ts` |
| `inspector` | 1 | 1 | `main.tsx` |
| `node:net` | 1 | 1 | `upstreamproxy/relay.ts` |
| `node:os` | 1 | 1 | `commands/install.tsx` |
| `node:path` | 1 | 1 | `commands/install.tsx` |
| `tty` | 1 | 1 | `utils/renderOptions.ts` |
| `v8` | 1 | 1 | `utils/heapDumpService.ts` |
| `vm` | 1 | 1 | `state/AppStateStore.ts` |
| `zlib` | 1 | 1 | `utils/ansiToPng.ts` |

### General Utilities and Parsing

| Package | Files | Imports | Sample Files |
|---|---:|---:|---|
| `zod` | 128 | 128 | `services/teamMemorySync/types.ts`<br/>`services/api/bootstrap.ts` |
| `lodash-es` | 107 | 124 | `projectOnboardingState.ts`<br/>`services/analytics/growthbook.ts` |
| `diff` | 19 | 19 | `services/api/promptCacheBreakDetection.ts`<br/>`native-ts/color-diff/index.ts` |
| `execa` | 16 | 16 | `commands/remote-setup/remote-setup.tsx`<br/>`commands/thinkback/thinkback.tsx` |
| `semver` | 5 | 8 | `hooks/useUpdateNotification.ts`<br/>`utils/semver.ts` |
| `chokidar` | 5 | 6 | `utils/cronScheduler.ts`<br/>`keybindings/loadUserBindings.ts` |
| `ignore` | 5 | 5 | `skills/loadSkillsDir.ts`<br/>`hooks/fileSuggestions.ts` |
| `lru-cache` | 5 | 5 | `services/lsp/LSPDiagnosticRegistry.ts`<br/>`utils/memoize.ts` |
| `type-fest` | 4 | 4 | `types/hooks.ts`<br/>`ink/components/Button.tsx` |
| `vscode-languageserver-protocol` | 3 | 3 | `services/lsp/passiveFeedback.ts`<br/>`services/lsp/LSPClient.ts` |
| `shell-quote` | 2 | 3 | `utils/bash/commands.ts`<br/>`utils/bash/shellQuote.ts` |
| `fflate` | 2 | 2 | `utils/plugins/zipCache.ts`<br/>`utils/dxt/zip.ts` |
| `vscode-languageserver-types` | 2 | 2 | `tools/LSPTool/formatters.ts`<br/>`tools/LSPTool/LSPTool.ts` |
| `proper-lockfile` | 1 | 3 | `utils/lockfile.ts` |
| `turndown` | 1 | 2 | `tools/WebFetchTool/utils.ts` |
| `yaml` | 1 | 2 | `utils/yaml.ts` |
| `ajv` | 1 | 1 | `tools/SyntheticOutputTool/SyntheticOutputTool.ts` |
| `cacache` | 1 | 1 | `utils/cleanup.ts` |
| `env-paths` | 1 | 1 | `utils/cachePaths.ts` |
| `jsonc-parser` | 1 | 1 | `utils/json.ts` |
| `picomatch` | 1 | 1 | `utils/claudemd.ts` |
| `plist` | 1 | 1 | `services/notifier.ts` |
| `stack-utils` | 1 | 1 | `ink/components/ErrorOverview.tsx` |
| `tree-kill` | 1 | 1 | `utils/ShellCommand.ts` |
| `vscode-jsonrpc` | 1 | 1 | `services/lsp/LSPClient.ts` |

## Full Raw Package Table

- Machine-readable JSON: [`docs/architecture/package-data/import-inventory.json`](package-data/import-inventory.json)
- TSV export: [`docs/architecture/package-data/external-packages.tsv`](package-data/external-packages.tsv)
- Markdown table export: [`docs/architecture/package-data/external-packages-table.md`](package-data/external-packages-table.md)

## Inference Notes

- Some package names are runtime aliases (for example `bun:bundle`) rather than npm modules.
- A few imports can be feature-gated and not active in all builds.
- Without a lockfile/manifest, versions cannot be recovered from source imports alone.
