/**
 * Get Cluster Snapshot Tool
 * Fetches current state of Kubernetes cluster including nodes, workloads, pods, and Istio resources
 */

import { z } from "zod";
import type { V1Node, V1Namespace, V1Pod, V1Deployment, V1StatefulSet, V1DaemonSet, V2HorizontalPodAutoscaler } from "@kubernetes/client-node";
import {
  type K8sOpsTool,
  type ToolResult,
  type ToolExecutionContext,
  type ClusterSnapshot,
  type NodeInfo,
  type WorkloadInfo,
  type PodInfo,
  type HPAInfo,
  type NamespaceSummary,
  type VirtualServiceInfo,
  type DestinationRuleInfo,
  type GatewayInfo,
  type IstioHTTPRoute,
  type IstioRouteDestination,
  type DestinationRuleSubset,
} from "../../types.js";
import {
  createK8sClients,
  listVirtualServices,
  listDestinationRules,
  listGateways,
} from "../k8sClient.js";

// Input schema for the tool
export const GetClusterSnapshotInputSchema = z.object({
  namespaces: z
    .array(z.string())
    .optional()
    .describe("Filter by specific namespaces. If empty, fetches all namespaces."),
  includeIstio: z
    .boolean()
    .default(true)
    .describe("Whether to include Istio resources (VirtualServices, DestinationRules, Gateways)"),
  includeSystemNamespaces: z
    .boolean()
    .default(false)
    .describe("Whether to include system namespaces like kube-system"),
});

export type GetClusterSnapshotInput = z.infer<typeof GetClusterSnapshotInputSchema>;

/**
 * System namespaces to exclude by default
 */
const SYSTEM_NAMESPACES = [
  "kube-system",
  "kube-public",
  "kube-node-lease",
  "istio-system",
  "cert-manager",
];

/**
 * Parse node info from K8s API response
 */
function parseNodeInfo(node: {
  metadata?: { name?: string; labels?: Record<string, string> };
  status?: {
    capacity?: { cpu?: string; memory?: string; pods?: string };
    allocatable?: { cpu?: string; memory?: string; pods?: string };
    conditions?: Array<{ type?: string; status?: string; reason?: string }>;
  };
}): NodeInfo {
  return {
    name: node.metadata?.name ?? "unknown",
    labels: node.metadata?.labels ?? {},
    capacity: {
      cpu: node.status?.capacity?.cpu ?? "0",
      memory: node.status?.capacity?.memory ?? "0",
      pods: node.status?.capacity?.pods ?? "0",
    },
    allocatable: {
      cpu: node.status?.allocatable?.cpu ?? "0",
      memory: node.status?.allocatable?.memory ?? "0",
      pods: node.status?.allocatable?.pods ?? "0",
    },
    conditions:
      node.status?.conditions?.map((c) => ({
        type: c.type ?? "Unknown",
        status: c.status ?? "Unknown",
        reason: c.reason,
      })) ?? [],
  };
}

/**
 * Parse workload info from K8s API response
 */
function parseWorkloadInfo(
  workload: {
    kind?: string;
    metadata?: {
      name?: string;
      namespace?: string;
      labels?: Record<string, string>;
      creationTimestamp?: string;
    };
    spec?: {
      replicas?: number;
      template?: {
        spec?: {
          containers?: Array<{
            name?: string;
            resources?: {
              requests?: { cpu?: string; memory?: string };
              limits?: { cpu?: string; memory?: string };
            };
          }>;
        };
      };
    };
    status?: {
      replicas?: number;
      readyReplicas?: number;
      availableReplicas?: number;
    };
  },
  kind: "Deployment" | "StatefulSet" | "DaemonSet"
): WorkloadInfo {
  const containers =
    workload.spec?.template?.spec?.containers?.map((c) => ({
      name: c.name ?? "unknown",
      requests: c.resources?.requests
        ? { cpu: c.resources.requests.cpu, memory: c.resources.requests.memory }
        : undefined,
      limits: c.resources?.limits
        ? { cpu: c.resources.limits.cpu, memory: c.resources.limits.memory }
        : undefined,
    })) ?? [];

  return {
    kind,
    name: workload.metadata?.name ?? "unknown",
    namespace: workload.metadata?.namespace ?? "default",
    replicas: {
      desired: workload.spec?.replicas ?? 0,
      ready: workload.status?.readyReplicas ?? 0,
      available: workload.status?.availableReplicas ?? 0,
    },
    containers,
    labels: workload.metadata?.labels,
    creationTimestamp: workload.metadata?.creationTimestamp,
  };
}

/**
 * Parse pod info from K8s API response
 */
function parsePodInfo(pod: {
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    ownerReferences?: Array<{ kind?: string; name?: string }>;
  };
  spec?: { nodeName?: string };
  status?: {
    phase?: string;
    conditions?: Array<{
      type?: string;
      status?: string;
      lastTransitionTime?: string;
    }>;
    containerStatuses?: Array<{
      name?: string;
      ready?: boolean;
      restartCount?: number;
      state?: {
        running?: unknown;
        waiting?: { reason?: string };
        terminated?: { reason?: string };
      };
    }>;
  };
}): PodInfo {
  const ownerRef = pod.metadata?.ownerReferences?.[0];

  return {
    name: pod.metadata?.name ?? "unknown",
    namespace: pod.metadata?.namespace ?? "default",
    nodeName: pod.spec?.nodeName,
    phase: pod.status?.phase ?? "Unknown",
    conditions:
      pod.status?.conditions?.map((c) => ({
        type: c.type ?? "Unknown",
        status: c.status ?? "Unknown",
        lastTransitionTime: c.lastTransitionTime,
      })) ?? [],
    restartCount:
      pod.status?.containerStatuses?.reduce(
        (sum, c) => sum + (c.restartCount ?? 0),
        0
      ) ?? 0,
    containers:
      pod.status?.containerStatuses?.map((c) => {
        let state = "unknown";
        if (c.state?.running) state = "running";
        else if (c.state?.waiting) state = `waiting:${c.state.waiting.reason ?? "unknown"}`;
        else if (c.state?.terminated)
          state = `terminated:${c.state.terminated.reason ?? "unknown"}`;

        return {
          name: c.name ?? "unknown",
          ready: c.ready ?? false,
          restartCount: c.restartCount ?? 0,
          state,
        };
      }) ?? [],
    ownerRef: ownerRef
      ? { kind: ownerRef.kind ?? "Unknown", name: ownerRef.name ?? "unknown" }
      : undefined,
    creationTimestamp: pod.metadata?.creationTimestamp,
  };
}

/**
 * Parse HPA info from K8s API response
 */
function parseHPAInfo(hpa: {
  metadata?: { name?: string; namespace?: string };
  spec?: {
    scaleTargetRef?: { kind?: string; name?: string };
    minReplicas?: number;
    maxReplicas?: number;
    metrics?: Array<{
      type?: string;
      resource?: {
        name?: string;
        target?: { type?: string; averageUtilization?: number };
      };
    }>;
  };
  status?: {
    currentReplicas?: number;
    desiredReplicas?: number;
    currentMetrics?: Array<{
      type?: string;
      resource?: {
        name?: string;
        current?: { averageUtilization?: number; averageValue?: string };
      };
    }>;
  };
}): HPAInfo {
  return {
    name: hpa.metadata?.name ?? "unknown",
    namespace: hpa.metadata?.namespace ?? "default",
    targetRef: {
      kind: hpa.spec?.scaleTargetRef?.kind ?? "Unknown",
      name: hpa.spec?.scaleTargetRef?.name ?? "unknown",
    },
    minReplicas: hpa.spec?.minReplicas ?? 1,
    maxReplicas: hpa.spec?.maxReplicas ?? 1,
    currentReplicas: hpa.status?.currentReplicas ?? 0,
    desiredReplicas: hpa.status?.desiredReplicas ?? 0,
    metrics: hpa.status?.currentMetrics?.map((m) => ({
      type: m.type ?? "Unknown",
      name: m.resource?.name,
      currentValue: m.resource?.current?.averageValue,
      targetValue: m.resource?.current?.averageUtilization?.toString(),
    })),
  };
}

/**
 * Parse VirtualService info from raw Istio CRD
 */
function parseVirtualServiceInfo(vs: {
  metadata?: { name?: string; namespace?: string };
  spec?: {
    hosts?: string[];
    gateways?: string[];
    http?: Array<{
      match?: Array<{
        uri?: { exact?: string; prefix?: string; regex?: string };
        headers?: Record<string, { exact?: string; prefix?: string; regex?: string }>;
      }>;
      route?: Array<{
        destination?: { host?: string; subset?: string; port?: { number?: number } };
        weight?: number;
      }>;
      mirror?: { host?: string; subset?: string; port?: { number?: number } };
      timeout?: string;
      retries?: { attempts?: number; perTryTimeout?: string };
    }>;
    tcp?: Array<{
      match?: unknown[];
      route?: Array<{
        destination?: { host?: string; subset?: string; port?: { number?: number } };
        weight?: number;
      }>;
    }>;
  };
}): VirtualServiceInfo {
  const parseRoute = (r: {
    destination?: { host?: string; subset?: string; port?: { number?: number } };
    weight?: number;
  }): IstioRouteDestination => ({
    host: r.destination?.host ?? "",
    subset: r.destination?.subset,
    port: r.destination?.port?.number,
    weight: r.weight,
  });

  return {
    name: vs.metadata?.name ?? "unknown",
    namespace: vs.metadata?.namespace ?? "default",
    hosts: vs.spec?.hosts ?? [],
    gateways: vs.spec?.gateways,
    http: vs.spec?.http?.map(
      (h): IstioHTTPRoute => ({
        match: h.match?.map((m) => ({
          uri: m.uri,
          headers: m.headers,
        })),
        route: h.route?.map(parseRoute),
        mirror: h.mirror
          ? {
              host: h.mirror.host ?? "",
              subset: h.mirror.subset,
              port: h.mirror.port?.number,
            }
          : undefined,
        timeout: h.timeout,
        retries: h.retries
          ? {
              attempts: h.retries.attempts ?? 1,
              perTryTimeout: h.retries.perTryTimeout,
            }
          : undefined,
      })
    ),
    tcp: vs.spec?.tcp?.map((t) => ({
      match: t.match,
      route: t.route?.map(parseRoute),
    })),
    raw: vs,
  };
}

/**
 * Parse DestinationRule info from raw Istio CRD
 */
function parseDestinationRuleInfo(dr: {
  metadata?: { name?: string; namespace?: string };
  spec?: {
    host?: string;
    subsets?: Array<{
      name?: string;
      labels?: Record<string, string>;
      trafficPolicy?: unknown;
    }>;
    trafficPolicy?: {
      connectionPool?: unknown;
      loadBalancer?: unknown;
      tls?: { mode?: string };
    };
  };
}): DestinationRuleInfo {
  return {
    name: dr.metadata?.name ?? "unknown",
    namespace: dr.metadata?.namespace ?? "default",
    host: dr.spec?.host ?? "",
    subsets: dr.spec?.subsets?.map(
      (s): DestinationRuleSubset => ({
        name: s.name ?? "unknown",
        labels: s.labels ?? {},
        trafficPolicy: s.trafficPolicy,
      })
    ),
    trafficPolicy: dr.spec?.trafficPolicy
      ? {
          connectionPool: dr.spec.trafficPolicy.connectionPool,
          loadBalancer: dr.spec.trafficPolicy.loadBalancer,
          tls: dr.spec.trafficPolicy.tls
            ? { mode: dr.spec.trafficPolicy.tls.mode }
            : undefined,
        }
      : undefined,
    raw: dr,
  };
}

/**
 * Parse Gateway info from raw Istio CRD
 */
function parseGatewayInfo(gw: {
  metadata?: { name?: string; namespace?: string };
  spec?: {
    servers?: Array<{
      port?: { number?: number; name?: string; protocol?: string };
      hosts?: string[];
      tls?: { mode?: string; credentialName?: string };
    }>;
  };
}): GatewayInfo {
  return {
    name: gw.metadata?.name ?? "unknown",
    namespace: gw.metadata?.namespace ?? "default",
    servers:
      gw.spec?.servers?.map((s) => ({
        port: {
          number: s.port?.number ?? 0,
          name: s.port?.name ?? "unknown",
          protocol: s.port?.protocol ?? "HTTP",
        },
        hosts: s.hosts ?? [],
        tls: s.tls ? { mode: s.tls.mode, credentialName: s.tls.credentialName } : undefined,
      })) ?? [],
    raw: gw,
  };
}

/**
 * Execute the get-cluster-snapshot tool
 */
async function executeGetClusterSnapshot(
  input: GetClusterSnapshotInput,
  context: ToolExecutionContext
): Promise<ToolResult<ClusterSnapshot>> {
  const startTime = Date.now();
  const warnings: string[] = [];

  try {
    const clients = createK8sClients(context.k8sMode);

    // Fetch nodes
    context.logger?.("Fetching nodes...");
    const nodesResponse = await clients.coreV1Api.listNode();
    const nodes: NodeInfo[] = (nodesResponse.items ?? []).map((n: V1Node) =>
      parseNodeInfo(n as Parameters<typeof parseNodeInfo>[0])
    );

    // Determine which namespaces to fetch
    let targetNamespaces: string[] = input.namespaces ?? [];

    if (targetNamespaces.length === 0) {
      context.logger?.("Fetching namespaces...");
      const nsResponse = await clients.coreV1Api.listNamespace();
      targetNamespaces = (nsResponse.items ?? [])
        .map((ns: V1Namespace) => ns.metadata?.name ?? "")
        .filter((name: string) => name !== "");

      if (!input.includeSystemNamespaces) {
        targetNamespaces = targetNamespaces.filter(
          (ns: string) => !SYSTEM_NAMESPACES.includes(ns)
        );
      }
    }

    // Fetch namespace summaries
    const namespaces: NamespaceSummary[] = [];
    const workloads: WorkloadInfo[] = [];
    const pods: PodInfo[] = [];
    const hpas: HPAInfo[] = [];

    for (const ns of targetNamespaces) {
      context.logger?.(`Fetching resources from namespace: ${ns}`);

      // Fetch pods
      const podsResponse = await clients.coreV1Api.listNamespacedPod({ namespace: ns });
      const nsPods = (podsResponse.items ?? []).map((p: V1Pod) =>
        parsePodInfo(p as Parameters<typeof parsePodInfo>[0])
      );
      pods.push(...nsPods);

      // Fetch deployments
      const deploymentsResponse = await clients.appsV1Api.listNamespacedDeployment({ namespace: ns });
      const nsDeployments = (deploymentsResponse.items ?? []).map((d: V1Deployment) =>
        parseWorkloadInfo(d as Parameters<typeof parseWorkloadInfo>[0], "Deployment")
      );
      workloads.push(...nsDeployments);

      // Fetch statefulsets
      const statefulSetsResponse = await clients.appsV1Api.listNamespacedStatefulSet({ namespace: ns });
      const nsStatefulSets = (statefulSetsResponse.items ?? []).map((s: V1StatefulSet) =>
        parseWorkloadInfo(s as Parameters<typeof parseWorkloadInfo>[0], "StatefulSet")
      );
      workloads.push(...nsStatefulSets);

      // Fetch daemonsets
      const daemonSetsResponse = await clients.appsV1Api.listNamespacedDaemonSet({ namespace: ns });
      const nsDaemonSets = (daemonSetsResponse.items ?? []).map((d: V1DaemonSet) =>
        parseWorkloadInfo(
          { ...d, spec: { ...d.spec, replicas: d.status?.desiredNumberScheduled } } as Parameters<
            typeof parseWorkloadInfo
          >[0],
          "DaemonSet"
        )
      );
      workloads.push(...nsDaemonSets);

      // Fetch HPAs
      try {
        const hpaResponse = await clients.autoscalingV2Api.listNamespacedHorizontalPodAutoscaler({ namespace: ns });
        const nsHPAs = (hpaResponse.items ?? []).map((h: V2HorizontalPodAutoscaler) =>
          parseHPAInfo(h as Parameters<typeof parseHPAInfo>[0])
        );
        hpas.push(...nsHPAs);
      } catch {
        warnings.push(`Failed to fetch HPAs in namespace ${ns}`);
      }

      // Add namespace summary
      namespaces.push({
        name: ns,
        status: "Active",
        podCount: nsPods.length,
        workloadCount: nsDeployments.length + nsStatefulSets.length + nsDaemonSets.length,
      });
    }

    // Fetch Istio resources if requested
    let istio: ClusterSnapshot["istio"] = undefined;

    if (input.includeIstio) {
      context.logger?.("Fetching Istio resources...");

      const virtualServices: VirtualServiceInfo[] = [];
      const destinationRules: DestinationRuleInfo[] = [];
      const gateways: GatewayInfo[] = [];

      try {
        const vsRaw = await listVirtualServices(clients.customObjectsApi);
        virtualServices.push(
          ...vsRaw.map((vs: unknown) =>
            parseVirtualServiceInfo(vs as Parameters<typeof parseVirtualServiceInfo>[0])
          )
        );
      } catch (error) {
        warnings.push(`Failed to fetch VirtualServices: ${String(error)}`);
      }

      try {
        const drRaw = await listDestinationRules(clients.customObjectsApi);
        destinationRules.push(
          ...drRaw.map((dr: unknown) =>
            parseDestinationRuleInfo(dr as Parameters<typeof parseDestinationRuleInfo>[0])
          )
        );
      } catch (error) {
        warnings.push(`Failed to fetch DestinationRules: ${String(error)}`);
      }

      try {
        const gwRaw = await listGateways(clients.customObjectsApi);
        gateways.push(
          ...gwRaw.map((gw: unknown) =>
            parseGatewayInfo(gw as Parameters<typeof parseGatewayInfo>[0])
          )
        );
      } catch (error) {
        warnings.push(`Failed to fetch Gateways: ${String(error)}`);
      }

      istio = { virtualServices, destinationRules, gateways };
    }

    const snapshot: ClusterSnapshot = {
      timestamp: new Date().toISOString(),
      nodes,
      namespaces,
      workloads,
      pods,
      hpas,
      istio,
    };

    return {
      success: true,
      data: snapshot,
      metadata: {
        executionTimeMs: Date.now() - startTime,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "CLUSTER_SNAPSHOT_FAILED",
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  }
}

/**
 * Get Cluster Snapshot Tool definition
 */
export const getClusterSnapshotTool: K8sOpsTool<GetClusterSnapshotInput, ClusterSnapshot> = {
  id: "get-cluster-snapshot",
  title: "Get Cluster Snapshot",
  description:
    "Fetches a comprehensive snapshot of the Kubernetes cluster including nodes, namespaces, workloads (Deployments, StatefulSets, DaemonSets), pods, HPAs, and optionally Istio resources (VirtualServices, DestinationRules, Gateways).",
  inputSchema: GetClusterSnapshotInputSchema,
  execute: executeGetClusterSnapshot,
};
