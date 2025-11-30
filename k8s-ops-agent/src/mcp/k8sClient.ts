/**
 * Kubernetes client helper for loading kubeconfig or in-cluster config
 */

import * as k8s from "@kubernetes/client-node";

export type K8sMode = "kubeconfig" | "incluster";

/**
 * Get the K8s mode from environment variable or default to kubeconfig
 */
export function getK8sMode(): K8sMode {
  const mode = process.env.K8S_MODE?.toLowerCase();
  if (mode === "incluster") {
    return "incluster";
  }
  return "kubeconfig";
}

/**
 * Create a KubeConfig instance based on the mode
 */
export function loadKubeConfig(mode?: K8sMode): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  const actualMode = mode ?? getK8sMode();

  if (actualMode === "incluster") {
    kc.loadFromCluster();
  } else {
    kc.loadFromDefault();
  }

  return kc;
}

/**
 * K8s API clients container
 */
export interface K8sClients {
  kubeConfig: k8s.KubeConfig;
  coreV1Api: k8s.CoreV1Api;
  appsV1Api: k8s.AppsV1Api;
  autoscalingV2Api: k8s.AutoscalingV2Api;
  customObjectsApi: k8s.CustomObjectsApi;
}

/**
 * Create all necessary K8s API clients
 */
export function createK8sClients(mode?: K8sMode): K8sClients {
  const kubeConfig = loadKubeConfig(mode);

  return {
    kubeConfig,
    coreV1Api: kubeConfig.makeApiClient(k8s.CoreV1Api),
    appsV1Api: kubeConfig.makeApiClient(k8s.AppsV1Api),
    autoscalingV2Api: kubeConfig.makeApiClient(k8s.AutoscalingV2Api),
    customObjectsApi: kubeConfig.makeApiClient(k8s.CustomObjectsApi),
  };
}

/**
 * Istio CRD group and version constants
 */
export const ISTIO_NETWORKING_GROUP = "networking.istio.io";
export const ISTIO_NETWORKING_VERSION = "v1beta1";

/**
 * List Istio VirtualServices
 */
export async function listVirtualServices(
  customObjectsApi: k8s.CustomObjectsApi,
  namespace?: string
): Promise<unknown[]> {
  try {
    if (namespace) {
      const response = await customObjectsApi.listNamespacedCustomObject({
        group: ISTIO_NETWORKING_GROUP,
        version: ISTIO_NETWORKING_VERSION,
        namespace,
        plural: "virtualservices"
      });
      return (response as { items?: unknown[] })?.items ?? [];
    } else {
      const response = await customObjectsApi.listClusterCustomObject({
        group: ISTIO_NETWORKING_GROUP,
        version: ISTIO_NETWORKING_VERSION,
        plural: "virtualservices"
      });
      return (response as { items?: unknown[] })?.items ?? [];
    }
  } catch (error) {
    // Istio might not be installed
    if ((error as { statusCode?: number })?.statusCode === 404) {
      return [];
    }
    throw error;
  }
}

/**
 * List Istio DestinationRules
 */
export async function listDestinationRules(
  customObjectsApi: k8s.CustomObjectsApi,
  namespace?: string
): Promise<unknown[]> {
  try {
    if (namespace) {
      const response = await customObjectsApi.listNamespacedCustomObject({
        group: ISTIO_NETWORKING_GROUP,
        version: ISTIO_NETWORKING_VERSION,
        namespace,
        plural: "destinationrules"
      });
      return (response as { items?: unknown[] })?.items ?? [];
    } else {
      const response = await customObjectsApi.listClusterCustomObject({
        group: ISTIO_NETWORKING_GROUP,
        version: ISTIO_NETWORKING_VERSION,
        plural: "destinationrules"
      });
      return (response as { items?: unknown[] })?.items ?? [];
    }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 404) {
      return [];
    }
    throw error;
  }
}

/**
 * List Istio Gateways
 */
export async function listGateways(
  customObjectsApi: k8s.CustomObjectsApi,
  namespace?: string
): Promise<unknown[]> {
  try {
    if (namespace) {
      const response = await customObjectsApi.listNamespacedCustomObject({
        group: ISTIO_NETWORKING_GROUP,
        version: ISTIO_NETWORKING_VERSION,
        namespace,
        plural: "gateways"
      });
      return (response as { items?: unknown[] })?.items ?? [];
    } else {
      const response = await customObjectsApi.listClusterCustomObject({
        group: ISTIO_NETWORKING_GROUP,
        version: ISTIO_NETWORKING_VERSION,
        plural: "gateways"
      });
      return (response as { items?: unknown[] })?.items ?? [];
    }
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 404) {
      return [];
    }
    throw error;
  }
}
