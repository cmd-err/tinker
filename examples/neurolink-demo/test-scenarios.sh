#!/bin/bash
# Test scenarios for recursive investigation
# Run with: bash test-scenarios.sh <scenario-number>

set -e

cd "$(dirname "$0")"

echo "╔═══════════════════════════════════════════════════════════════════╗"
echo "║   K8s Ops Agent - Test Scenarios                                  ║"
echo "╚═══════════════════════════════════════════════════════════════════╝"
echo ""

# Test scenario selector
SCENARIO=${1:-0}

case $SCENARIO in
  1)
    echo "🧪 Scenario 1: Basic Health Check (No Recursion Expected)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    npm start "What is the overall health of my cluster?"
    ;;

  2)
    echo "🧪 Scenario 2: Health Check with Recursive Investigation"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    npm start "Analyze cluster health. If you find any critical issues, use investigate-deeper to find root causes."
    ;;

  3)
    echo "🧪 Scenario 3: Cost Optimization with Deep Dive"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    npm start "Find cost optimization opportunities. For the top 3 most expensive issues, spawn sub-investigations to analyze root causes."
    ;;

  4)
    echo "🧪 Scenario 4: Zombie Workloads Deep Investigation"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    npm start "Detect zombie workloads. For any crash-looping pods, investigate deeper to understand why they're failing."
    ;;

  5)
    echo "🧪 Scenario 5: Istio Analysis with Recursion"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    npm start "Analyze Istio traffic configuration. If you find misconfigured routes or orphan resources, investigate each one deeply."
    ;;

  6)
    echo "🧪 Scenario 6: Multi-Level Recursive Investigation"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    npm start "Give me a complete cluster report. For any findings, investigate deeper. If sub-investigations find interesting patterns, investigate those even deeper (up to 3 levels)."
    ;;

  0|*)
    echo "Available Test Scenarios:"
    echo ""
    echo "1. Basic Health Check (No Recursion)"
    echo "   → Tests basic functionality without recursive investigation"
    echo ""
    echo "2. Health Check with Recursive Investigation ⭐"
    echo "   → Tests investigate-deeper tool with cluster health analysis"
    echo ""
    echo "3. Cost Optimization with Deep Dive ⭐"
    echo "   → Tests recursive investigation for cost issues"
    echo ""
    echo "4. Zombie Workloads Deep Investigation ⭐"
    echo "   → Tests recursive investigation for failed pods"
    echo ""
    echo "5. Istio Analysis with Recursion"
    echo "   → Tests recursive investigation for service mesh issues"
    echo ""
    echo "6. Multi-Level Recursive Investigation ⭐⭐"
    echo "   → Tests depth-2+ recursive investigation (most advanced)"
    echo ""
    echo "Usage: bash test-scenarios.sh <scenario-number>"
    echo "Example: bash test-scenarios.sh 2"
    echo ""
    ;;
esac

echo ""
echo "💡 After test completes, check session files:"
echo "   ls -la .k8s-ops-sessions/"
echo "   cat .k8s-ops-sessions/session-*.json | jq ."
echo ""
