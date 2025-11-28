/**
 * Detect Zombie Workloads Tool
 * Identifies pods, nodes, and namespaces that appear to be inactive or problematic
 */

import { z } from "zod";
import {
  type K8sOpsTool,
  type ToolResult,
  type ToolExecutionContext,
  type ClusterSnapshot,
  type ZombieDetectionResult,
  type ZombieWorkload,
  type PodInfo,
  type NodeInfo,
  type NamespaceSummary,
  type WorkloadInfo,
  type PodContainerStatus,
  type PodCondition,
  type NodeCondition,
} from "../../types.js";

// Input schema for the tool
export const DetectZombieWorkloadsInputSchema = z.object({
  snapshot: z
    .custom<ClusterSnapshot>()
    .describe("The cluster snapshot to analyze"),
  thresholds: z
    .object({
      idleDaysThreshold: z
        .number()
        .min(0)
        .default(7)
        .describe("Days without activity to consider a workload zombie"),
      crashLoopRestartThreshold: z
        .number()
        .min(1)
        .default(5)
        .describe("Number of restarts to consider a pod in crash loop"),
      stuckPodHours: z
        .number()
        .min(0)
        .default(24)
        .describe("Hours in pending/unknown state to consider stuck"),
    })
    .default({})
    .describe("Thresholds for zombie detection"),
});

export type DetectZombieWorkloadsInput = z.infer<typeof DetectZombieWorkloadsInputSchema>;

/**
 * System namespaces to skip during zombie detection
 */
const SYSTEM_NAMESPACES_TO_SKIP = [
  "kube-system",
  "kube-public",
  "kube-node-lease",
  "default",
  "istio-system",
];

/**
 * Generate unique ID for zombie workloads
 */
function generateId(kind: string, name: string, namespace?: string): string {
  return `zombie-${kind}-${namespace ? `${namespace}-` : ""}${name}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-");
}

/**
 * Parse ISO date string and return age in hours
 */
function getAgeInHours(timestamp?: string): number {
  if (!timestamp) return 0;
  try {
    const date = new Date(timestamp);
    const now = new Date();
    return (now.getTime() - date.getTime()) / (1000 * 60 * 60);
  } catch {
    return 0;
  }
}

/**
 * Detect zombie pods (crash looping, stuck, failed)
 */
function detectZombiePods(
  pods: PodInfo[],
  thresholds: { crashLoopRestartThreshold: number; stuckPodHours: number; idleDaysThreshold: number }
): ZombieWorkload[] {
  const zombies: ZombieWorkload[] = [];

  for (const pod of pods) {
    const ageHours = getAgeInHours(pod.creationTimestamp);

    // Check for CrashLoopBackOff
    const crashLoopContainers = pod.containers.filter(
      (c: PodContainerStatus) =>
        c.state?.includes("waiting:CrashLoopBackOff") ||
        c.restartCount >= thresholds.crashLoopRestartThreshold
    );

    if (crashLoopContainers.length > 0) {
      zombies.push({
        id: generateId("Pod", pod.name, pod.namespace),
        kind: "Pod",
        name: pod.name,
        namespace: pod.namespace,
        reason: `Pod is in CrashLoopBackOff state. Containers affected: ${crashLoopContainers.map((c: PodContainerStatus) => c.name).join(", ")}. Total restarts: ${pod.restartCount}`,
        severity: "high",
        suggestedAction:
          "Investigate container logs and fix the underlying issue. If the workload is no longer needed, delete the pod.",
        details: {
          phase: pod.phase,
          restartCount: pod.restartCount,
          crashingContainers: crashLoopContainers.map((c: PodContainerStatus) => c.name),
        },
      });
      continue;
    }

    // Check for pods in error state
    if (pod.phase === "Failed") {
      zombies.push({
        id: generateId("Pod", pod.name, pod.namespace),
        kind: "Pod",
        name: pod.name,
        namespace: pod.namespace,
        reason: `Pod is in Failed state`,
        severity: "medium",
        suggestedAction:
          "Review pod events and logs to understand the failure. Clean up failed pods if they are no longer needed.",
        details: {
          phase: pod.phase,
          conditions: pod.conditions,
        },
      });
      continue;
    }

    // Check for pods stuck in Pending for too long
    if (pod.phase === "Pending" && ageHours > thresholds.stuckPodHours) {
      const schedulingCondition = pod.conditions.find(
        (c: PodCondition) => c.type === "PodScheduled" && c.status === "False"
      );

      zombies.push({
        id: generateId("Pod", pod.name, pod.namespace),
        kind: "Pod",
        name: pod.name,
        namespace: pod.namespace,
        reason: `Pod has been stuck in Pending state for ${ageHours.toFixed(0)} hours`,
        severity: "medium",
        suggestedAction: schedulingCondition
          ? "Check cluster capacity and node selectors. The pod may have unsatisfiable scheduling requirements."
          : "Investigate why the pod cannot be scheduled. Check resource requests, node selectors, and taints/tolerations.",
        lastActivityTime: pod.creationTimestamp,
        details: {
          phase: pod.phase,
          ageHours,
          conditions: pod.conditions,
        },
      });
      continue;
    }

    // Check for pods in Unknown state (usually indicates node issues)
    if (pod.phase === "Unknown" && ageHours > thresholds.stuckPodHours) {
      zombies.push({
        id: generateId("Pod", pod.name, pod.namespace),
        kind: "Pod",
        name: pod.name,
        namespace: pod.namespace,
        reason: `Pod is in Unknown state for ${ageHours.toFixed(0)} hours. This usually indicates node communication issues.`,
        severity: "high",
        suggestedAction:
          "Check the node status and kubelet health. The pod may need to be force deleted.",
        lastActivityTime: pod.creationTimestamp,
        details: {
          phase: pod.phase,
          nodeName: pod.nodeName,
          ageHours,
        },
      });
      continue;
    }

    // Check for containers in ImagePullBackOff
    const imagePullBackOff = pod.containers.filter((c: PodContainerStatus) =>
      c.state?.includes("waiting:ImagePullBackOff") ||
      c.state?.includes("waiting:ErrImagePull")
    );

    if (imagePullBackOff.length > 0 && ageHours > 1) {
      zombies.push({
        id: generateId("Pod", pod.name, pod.namespace),
        kind: "Pod",
        name: pod.name,
        namespace: pod.namespace,
        reason: `Pod has containers unable to pull images: ${imagePullBackOff.map((c: PodContainerStatus) => c.name).join(", ")}`,
        severity: "medium",
        suggestedAction:
          "Verify image names, registry credentials, and network connectivity. Fix the image reference or delete the pod if no longer needed.",
        details: {
          phase: pod.phase,
          affectedContainers: imagePullBackOff.map((c: PodContainerStatus) => c.name),
        },
      });
    }
  }

  return zombies;
}

/**
 * Detect zombie nodes (not ready, no pods, unschedulable)
 */
function detectZombieNodes(nodes: NodeInfo[], pods: PodInfo[]): ZombieWorkload[] {
  const zombies: ZombieWorkload[] = [];

  // Create a map of node -> running pod count
  const nodePodCount = new Map<string, number>();
  for (const pod of pods) {
    if (pod.nodeName && pod.phase === "Running") {
      nodePodCount.set(pod.nodeName, (nodePodCount.get(pod.nodeName) ?? 0) + 1);
    }
  }

  for (const node of nodes) {
    const readyCondition = node.conditions.find((c: NodeCondition) => c.type === "Ready");
    const isReady = readyCondition?.status === "True";
    const runningPodCount = nodePodCount.get(node.name) ?? 0;

    // Check for NotReady nodes
    if (!isReady) {
      zombies.push({
        id: generateId("Node", node.name),
        kind: "Node",
        name: node.name,
        reason: `Node is in NotReady state. Reason: ${readyCondition?.reason ?? "Unknown"}`,
        severity: "high",
        suggestedAction:
          "Investigate node health. Check kubelet status, network connectivity, and system resources. Consider draining and removing the node if it cannot be recovered.",
        details: {
          conditions: node.conditions,
          runningPodCount,
        },
      });
      continue;
    }

    // Check for nodes with problematic conditions
    const diskPressure = node.conditions.find(
      (c: NodeCondition) => c.type === "DiskPressure" && c.status === "True"
    );
    const memoryPressure = node.conditions.find(
      (c: NodeCondition) => c.type === "MemoryPressure" && c.status === "True"
    );
    const pidPressure = node.conditions.find(
      (c: NodeCondition) => c.type === "PIDPressure" && c.status === "True"
    );

    const pressures = [diskPressure, memoryPressure, pidPressure].filter(Boolean) as NodeCondition[];
    if (pressures.length > 0) {
      zombies.push({
        id: generateId("Node", node.name),
        kind: "Node",
        name: node.name,
        reason: `Node has resource pressure conditions: ${pressures.map((p: NodeCondition) => p.type).join(", ")}`,
        severity: "high",
        suggestedAction:
          "Address the resource pressure immediately. Consider draining the node and adding capacity.",
        details: {
          conditions: node.conditions,
          pressures: pressures.map((p: NodeCondition) => p.type),
        },
      });
    }

    // Check for nodes with no running pods (possible unused node)
    if (runningPodCount === 0) {
      // Skip if it's a control plane node
      const isControlPlane =
        node.labels["node-role.kubernetes.io/control-plane"] !== undefined ||
        node.labels["node-role.kubernetes.io/master"] !== undefined;

      if (!isControlPlane) {
        zombies.push({
          id: generateId("Node", node.name),
          kind: "Node",
          name: node.name,
          reason: `Node has no running pods and may be unused`,
          severity: "low",
          suggestedAction:
            "Verify if this node is needed. If it's intentionally empty (e.g., for burst capacity), you can ignore this. Otherwise, consider removing it to save costs.",
          details: {
            labels: node.labels,
            runningPodCount: 0,
          },
        });
      }
    }
  }

  return zombies;
}

/**
 * Detect zombie namespaces (empty or all pods failed)
 */
function detectZombieNamespaces(
  namespaces: NamespaceSummary[],
  workloads: WorkloadInfo[],
  pods: PodInfo[],
  idleDaysThreshold: number
): ZombieWorkload[] {
  const zombies: ZombieWorkload[] = [];
  const idleHoursThreshold = idleDaysThreshold * 24;

  for (const ns of namespaces) {
    const nsPods = pods.filter((p) => p.namespace === ns.name);
    const nsWorkloads = workloads.filter((w) => w.namespace === ns.name);
    const runningPods = nsPods.filter((p) => p.phase === "Running");
    const failedPods = nsPods.filter((p) => p.phase === "Failed");

    // Skip system namespaces
    if (
      SYSTEM_NAMESPACES_TO_SKIP.includes(ns.name) ||
      ns.name.startsWith("kube-")
    ) {
      continue;
    }

    // Check for namespaces with workloads but all pods failed
    if (nsWorkloads.length > 0 && runningPods.length === 0 && failedPods.length > 0) {
      zombies.push({
        id: generateId("Namespace", ns.name),
        kind: "Namespace",
        name: ns.name,
        reason: `Namespace has ${nsWorkloads.length} workloads but all pods are in failed state`,
        severity: "medium",
        suggestedAction:
          "Investigate why all pods in this namespace have failed. Fix the issues or clean up the namespace if no longer needed.",
        details: {
          workloadCount: nsWorkloads.length,
          failedPodCount: failedPods.length,
        },
      });
      continue;
    }

    // Check for old namespaces with no activity
    const nsAgeHours = getAgeInHours(ns.creationTimestamp);
    if (
      nsAgeHours > idleHoursThreshold &&
      ns.workloadCount === 0 &&
      nsPods.length === 0
    ) {
      zombies.push({
        id: generateId("Namespace", ns.name),
        kind: "Namespace",
        name: ns.name,
        reason: `Namespace is ${Math.floor(nsAgeHours / 24)} days old with no workloads or pods`,
        severity: "low",
        suggestedAction:
          "This namespace appears to be abandoned. Consider removing it if no longer needed.",
        lastActivityTime: ns.creationTimestamp,
        details: {
          ageInDays: Math.floor(nsAgeHours / 24),
        },
      });
    }
  }

  return zombies;
}

/**
 * Detect zombie deployments (stuck scaling, failed rollouts)
 */
function detectZombieWorkloads(
  workloads: WorkloadInfo[],
  pods: PodInfo[]
): ZombieWorkload[] {
  const zombies: ZombieWorkload[] = [];

  for (const workload of workloads) {
    const workloadPods = pods.filter(
      (p) =>
        p.namespace === workload.namespace &&
        p.ownerRef?.name?.includes(workload.name)
    );

    // Check for workloads with desired replicas > 0 but no pods
    if (workload.replicas.desired > 0 && workloadPods.length === 0) {
      const ageHours = getAgeInHours(workload.creationTimestamp);

      if (ageHours > 1) {
        zombies.push({
          id: generateId(workload.kind, workload.name, workload.namespace),
          kind: workload.kind,
          name: workload.name,
          namespace: workload.namespace,
          reason: `${workload.kind} has ${workload.replicas.desired} desired replicas but no pods exist`,
          severity: "medium",
          suggestedAction:
            "Investigate why pods are not being created. Check events, resource quotas, and node availability.",
          details: {
            desiredReplicas: workload.replicas.desired,
            podCount: 0,
          },
        });
      }
    }

    // Check for workloads stuck in rollout (available < desired for extended time)
    if (
      workload.replicas.desired > 0 &&
      workload.replicas.available < workload.replicas.desired
    ) {
      const ageHours = getAgeInHours(workload.creationTimestamp);

      // Only flag if it's been stuck for a while
      if (ageHours > 2) {
        const stuckReplicas = workload.replicas.desired - workload.replicas.available;
        zombies.push({
          id: generateId(workload.kind, workload.name, workload.namespace),
          kind: workload.kind,
          name: workload.name,
          namespace: workload.namespace,
          reason: `${workload.kind} has ${stuckReplicas} replicas that are not available (${workload.replicas.available}/${workload.replicas.desired} available)`,
          severity: "medium",
          suggestedAction:
            "Check if there's a failed rollout or scaling issue. Review pod events and container logs.",
          details: {
            desiredReplicas: workload.replicas.desired,
            availableReplicas: workload.replicas.available,
            readyReplicas: workload.replicas.ready,
          },
        });
      }
    }
  }

  return zombies;
}

/**
 * Execute the detect-zombie-workloads tool
 */
async function executeDetectZombieWorkloads(
  input: DetectZombieWorkloadsInput,
  _context: ToolExecutionContext
): Promise<ToolResult<ZombieDetectionResult>> {
  const startTime = Date.now();

  try {
    const { snapshot, thresholds } = input;
    const resolvedThresholds = {
      idleDaysThreshold: thresholds?.idleDaysThreshold ?? 7,
      crashLoopRestartThreshold: thresholds?.crashLoopRestartThreshold ?? 5,
      stuckPodHours: thresholds?.stuckPodHours ?? 24,
    };

    const zombies: ZombieWorkload[] = [];

    // Detect zombie pods
    zombies.push(...detectZombiePods(snapshot.pods, resolvedThresholds));

    // Detect zombie nodes
    zombies.push(...detectZombieNodes(snapshot.nodes, snapshot.pods));

    // Detect zombie namespaces
    zombies.push(
      ...detectZombieNamespaces(
        snapshot.namespaces,
        snapshot.workloads,
        snapshot.pods,
        resolvedThresholds.idleDaysThreshold
      )
    );

    // Detect zombie workloads (deployments, etc.)
    zombies.push(...detectZombieWorkloads(snapshot.workloads, snapshot.pods));

    // Deduplicate by ID
    const uniqueZombies = Array.from(
      new Map(zombies.map((z) => [z.id, z])).values()
    );

    // Generate summary
    const highSeverity = uniqueZombies.filter((z) => z.severity === "high").length;
    const mediumSeverity = uniqueZombies.filter((z) => z.severity === "medium").length;
    const lowSeverity = uniqueZombies.filter((z) => z.severity === "low").length;

    let summary = `Found ${uniqueZombies.length} zombie workloads`;
    if (uniqueZombies.length > 0) {
      summary += `: ${highSeverity} high, ${mediumSeverity} medium, ${lowSeverity} low severity.`;
    } else {
      summary += ". Your cluster appears healthy with no zombie workloads detected.";
    }

    const result: ZombieDetectionResult = {
      summary,
      zombieCount: uniqueZombies.length,
      zombies: uniqueZombies,
      analyzedAt: new Date().toISOString(),
    };

    return {
      success: true,
      data: result,
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "ZOMBIE_DETECTION_FAILED",
        message: error instanceof Error ? error.message : String(error),
        details: error,
      },
      metadata: {
        executionTimeMs: Date.now() - startTime,
      },
    };
  }
}

/**
 * Detect Zombie Workloads Tool definition
 */
export const detectZombieWorkloadsTool: K8sOpsTool<
  DetectZombieWorkloadsInput,
  ZombieDetectionResult
> = {
  id: "detect-zombie-workloads",
  title: "Detect Zombie Workloads",
  description:
    "Identifies zombie workloads in the cluster including crash-looping pods, failed pods, stuck pending pods, unhealthy nodes, and abandoned namespaces. Provides severity ratings and actionable recommendations.",
  inputSchema: DetectZombieWorkloadsInputSchema,
  execute: executeDetectZombieWorkloads,
};
