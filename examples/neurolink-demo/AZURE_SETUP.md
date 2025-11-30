# Azure OpenAI Setup for Neurolink K8s Demo

This demo now uses **Azure OpenAI** by default, matching the lighthouse configuration.

## Why Azure OpenAI?

Lighthouse uses Azure OpenAI with the `gpt-4o-automatic` model. This demo now matches that configuration exactly to ensure compatibility and consistent behavior.

## Setup Steps

### 1. Create Azure OpenAI Resource

1. Go to [Azure Portal](https://portal.azure.com/)
2. Search for "Azure OpenAI"
3. Click "Create" and fill in:
   - **Subscription**: Your Azure subscription
   - **Resource Group**: Create new or use existing
   - **Region**: Choose a region (e.g., East US, West Europe)
   - **Name**: Give it a unique name (e.g., `my-k8s-ops-openai`)
   - **Pricing Tier**: Standard S0

4. Click "Review + Create" → "Create"

### 2. Deploy a Model

1. Go to your Azure OpenAI resource
2. Click "Model deployments" → "Manage Deployments"
3. This opens **Azure OpenAI Studio**
4. Click "Deployments" → "Create new deployment"
5. Fill in:
   - **Model**: Select `gpt-4o`
   - **Deployment name**: `gpt-4o-automatic` (or any name you prefer)
   - **Model version**: Latest available
   - **Deployment type**: Standard

6. Click "Create"

### 3. Get Your Credentials

1. In Azure Portal, go to your Azure OpenAI resource
2. Click "Keys and Endpoint" in the left sidebar
3. Copy:
   - **KEY 1** (this is your API key)
   - **Endpoint** (e.g., `https://my-k8s-ops-openai.openai.azure.com`)

### 4. Configure the Demo

1. Copy the environment file:
   ```bash
   cd examples/neurolink-demo
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```bash
   AZURE_OPENAI_API_KEY=your_key_from_step_3
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
   AZURE_OPENAI_DEPLOYMENT=gpt-4o-automatic

   LLM_PROVIDER=azure
   LLM_MODEL=gpt-4o-automatic
   ```

### 5. Run the Demo

```bash
npm run build
npm start
```

## Expected Behavior

When you run the demo, you should see:

```
╔════════════════════════════════════════════════════════════════╗
║       Neurolink + K8s Ops Agent - Full Demo                     ║
╚════════════════════════════════════════════════════════════════╝

✅ LLM provider detected - running with Neurolink SDK

🔄 Initializing Neurolink...
✅ Neurolink initialized

🔄 Registering K8s Ops tools...
✅ K8s Ops Server registered with Neurolink
✅ K8s Ops tools registered

📦 Available tools:
   1. get-cluster-snapshot (from: k8s-ops)
   2. analyze-cost-optimization (from: k8s-ops)
   3. detect-zombie-workloads (from: k8s-ops)
   4. analyze-istio-traffic (from: k8s-ops)

🚀 Running analysis: "Give me a complete cluster health and optimization report"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 STREAMING RESPONSE:

🔧 Tool started: get-cluster-snapshot
✅ Tool completed: get-cluster-snapshot

[LLM streaming response appears here in real-time...]
```

## Troubleshooting

### Error: "AuthenticationError: [azure] AZURE_OPENAI_API_KEY not set"

**Solution**: Make sure you created a `.env` file (not just `.env.example`) and added your actual API key.

### Error: "Deployment not found"

**Solution**:
1. Check that your deployment name in `.env` matches exactly what you created in Azure OpenAI Studio
2. Try using the deployment name instead of the model name:
   ```bash
   AZURE_OPENAI_DEPLOYMENT=your-actual-deployment-name
   ```

### Error: "Invalid endpoint"

**Solution**: Make sure your endpoint URL:
- Starts with `https://`
- Ends with `.openai.azure.com`
- Does NOT have a trailing slash
- Example: `https://my-resource.openai.azure.com`

### Error: "getCurrentTime called 569 times"

**Solution**: This was the original bug! It should be fixed now. The fix:
1. `process.env.NEUROLINK_DISABLE_BUILTIN_TOOLS = "true"` disables built-in tools
2. Using `stream()` instead of `generate()`
3. `enableOrchestration: false` matching lighthouse

If you still see this error, please report it!

## Cost Considerations

Azure OpenAI charges per token:
- GPT-4o: ~$2.50 per 1M input tokens, ~$10 per 1M output tokens
- Each demo run typically uses ~2,000-5,000 tokens (under $0.10)
- Set up billing alerts in Azure Portal to monitor usage

## Alternative Providers

If you don't have Azure access, you can also use:

### Google AI (Free Tier Available)
```bash
# In .env
GOOGLE_AI_API_KEY=your_key
LLM_PROVIDER=google-ai
LLM_MODEL=gemini-2.0-flash-exp
```

### OpenAI
```bash
# In .env
OPENAI_API_KEY=your_key
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
```

### Anthropic Claude
```bash
# In .env
ANTHROPIC_API_KEY=your_key
LLM_PROVIDER=anthropic
LLM_MODEL=claude-3-5-sonnet-20241022
```

## Differences from Lighthouse

The demo now matches lighthouse's Neurolink configuration:

| Aspect | Demo | Lighthouse |
|--------|------|------------|
| **Provider** | Azure OpenAI | ✅ Azure OpenAI |
| **Model** | gpt-4o-automatic | ✅ gpt-4o-automatic |
| **Method** | `stream()` | ✅ `stream()` |
| **Orchestration** | `false` | ✅ `false` |
| **Built-in Tools** | Disabled | ✅ Disabled |
| **Temperature** | 0.3 | ✅ 0.3 |

## Next Steps

Once you have the demo running:

1. Try different queries:
   - "What is my cluster health status?"
   - "Find cost optimization opportunities"
   - "Detect zombie workloads"
   - "Check Istio traffic configuration"

2. Modify the system prompt in `src/index.ts` to customize behavior

3. Add your own MCP tools to extend functionality

4. Integrate into your CI/CD pipeline for automated cluster analysis

## Support

If you encounter issues:
1. Check this troubleshooting guide
2. Verify your Azure OpenAI setup in Azure Portal
3. Check the logs for specific error messages
4. Ensure your kubectl is configured correctly
