# Debugging Neurolink Tool Execution Issue

## Problem
Tools were registered and visible (`getAllAvailableTools()` showed all 4 K8s tools), but Azure OpenAI was NOT executing them. Instead, the LLM would say "I will fetch the cluster snapshot" without actually calling the tools.

## Root Cause Analysis

After deep investigation into the Neurolink SDK and comparing with lighthouse implementation:

### Key Findings:

1. **Tool Registration Works Correctly**
   - Tools are properly registered as in-memory MCP server via `addInMemoryMCPServer()`
   - `getAllAvailableTools()` correctly returns all 4 K8s tools
   -  Registration is NOT the issue

2. **Tool Passing to Provider Works**
   - Azure provider's `executeStream()` method properly calls `this.getAllTools()` (azureOpenai.ts:112)
   - Tools are passed to Vercel AI SDK's `streamText()` (azureOpenai.ts:196)
   - `toolChoice` is correctly set to `"auto"` when tools are available (azureOpenai.ts:197)
   -  Tool passing is NOT the issue

3. **The Real Issue: Extra Parameters**
   - Our demo was passing `disableTools: false` and `maxSteps: 10` explicitly
   - **Lighthouse does NOT pass these parameters**
   - These parameters might interfere with the Azure provider's default tool handling

## The Fix

### Changed in `examples/neurolink-demo/src/index.ts`

**BEFORE** (Broken - tools not executed):
```typescript
const streamParams = {
  input: { text: userQuery },
  context: { sessionId: `k8s-demo-${Date.now()}` },
  systemPrompt: `...`,
  temperature: 0.3,
  maxTokens: 4000,
  provider: process.env.LLM_PROVIDER || "azure",
  model: process.env.LLM_MODEL || "gpt-4o-automatic",
  disableTools: false,  // L REMOVE THIS
  maxSteps: 10,         // L REMOVE THIS
};
```

**AFTER** (Fixed - matches lighthouse):
```typescript
const streamParams = {
  input: { text: userQuery },
  context: { sessionId: `k8s-demo-${Date.now()}` },
  systemPrompt: `...`,
  temperature: 0.3,
  maxTokens: 4000,
  provider: process.env.LLM_PROVIDER || "azure",
  model: process.env.LLM_MODEL || "gpt-4o-automatic",
  // No disableTools - matches lighthouse
  // No maxSteps - matches lighthouse
};
```

## Why This Works

1. **Tool Category**: `registerTools()` registers tools with category "custom" (via `createCustomToolServerInfo()`)
2. **getCustomTools() Inclusion**: Custom tools are included in `getCustomTools()` which is called at neurolink.ts:2948
3. **Provider Access**: Custom tools are passed to provider via `setupToolExecutor({ customTools: this.getCustomTools() })`
4. **getAllTools() Chain**: Provider's `getAllTools()` includes custom tools → passed to `streamText()` → available to Azure OpenAI
5. **Tool Execution**: Azure OpenAI can now see and execute the tools with `toolChoice: "auto"`

## Tool Execution Flow (for reference)

```
User calls neurolink.stream(streamParams)
  �
NeuroLink.createMCPStream(options)
  �
Creates Azure provider via AIProviderFactory.createProvider()
  �
Calls provider.setupToolExecutor() with custom tools
  �
Calls provider.stream(options)
  �
AzureProvider.executeStream(options)
  �
Calls this.getAllTools() � returns all tools including MCP tools
  �
Calls streamText({ tools, toolChoice: "auto", maxSteps: DEFAULT_MAX_STEPS, ... })
  �
Vercel AI SDK executes tools when LLM requests them
```

## Verification Steps

To verify tools are working:

1. Make sure you're using Node v22+ (required for Azure provider):
   ```bash
   node --version  # Should be v22.x.x
   nvm use 22      # or your preferred Node version manager
   ```

2. Build and run the demo:
   ```bash
   npm run build
   npm start
   ```

3. Look for tool execution events in output:
   ```
   =' Tool started: get-cluster-snapshot
    Tool completed: get-cluster-snapshot
   ```

4. Check that LLM response includes ACTUAL data from tools, not just descriptions like "I will fetch..."

## Additional Notes

- **Node Version**: Azure provider requires Node v22+ due to undici dependency (`File is not defined` error with older versions)
- **Built-in Tools**: Disabled via `process.env.NEUROLINK_DISABLE_BUILTIN_TOOLS = "true"` to prevent getCurrentTime infinite loop
- **Orchestration**: Disabled via `enableOrchestration: false` to match lighthouse configuration
- **Provider**: Using Azure OpenAI with `gpt-4o-automatic` model (matches lighthouse default)

## Related Files

- [examples/neurolink-demo/src/index.ts](src/index.ts) - Main demo file (FIXED )
- `/Users/harsh.tiwari/Documents/breeze-repos/forked-neuro/src/lib/providers/azureOpenai.ts:105-233` - Azure provider's executeStream method
- `/Users/harsh.tiwari/Documents/breeze-repos/forked-neuro/src/lib/core/baseProvider.ts:1669-1695` - getAllTools implementation
- `/Users/harsh.tiwari/Documents/breeze-repos/lighthouse/src/lib/services/server/ai/core/sessionInstanceManager.ts:709-741` - Lighthouse reference implementation

## Next Steps

Run the demo with Node 22 and verify that tools are actually being executed!
