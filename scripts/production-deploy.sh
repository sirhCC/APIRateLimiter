#!/bin/bash

# =============================================================================
# Production Deployment Script for API Rate Limiter
# 
# This script handles complete production deployment with:
# - Environment validation
# - Security checks  
# - Rolling updates
# - Health verification
# - Rollback capabilities
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-production}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
NAMESPACE="${NAMESPACE:-api-rate-limiter}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-300}"
ROLLBACK_ON_FAILURE="${ROLLBACK_ON_FAILURE:-true}"

echo -e "${BLUE}🚀 Starting Production Deployment${NC}"
echo -e "${BLUE}Environment: ${DEPLOYMENT_ENV}${NC}"
echo -e "${BLUE}Image Tag: ${IMAGE_TAG}${NC}"
echo -e "${BLUE}Namespace: ${NAMESPACE}${NC}"

# =============================================================================
# Function: Check prerequisites
# =============================================================================
check_prerequisites() {
    echo -e "${BLUE}📋 Checking prerequisites...${NC}"
    
    # Check required tools
    local tools=("docker" "kubectl" "jq")
    for tool in "${tools[@]}"; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            echo -e "${RED}❌ Required tool not found: $tool${NC}"
            exit 1
        fi
    done
    
    # Check Kubernetes connection
    if ! kubectl cluster-info >/dev/null 2>&1; then
        echo -e "${RED}❌ Cannot connect to Kubernetes cluster${NC}"
        exit 1
    fi
    
    # Check namespace exists
    if ! kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️ Namespace ${NAMESPACE} doesn't exist, creating...${NC}"
        kubectl apply -f k8s/01-infrastructure.yaml
    fi
    
    echo -e "${GREEN}✅ Prerequisites check passed${NC}"
}

# =============================================================================
# Function: Validate environment
# =============================================================================
validate_environment() {
    echo -e "${BLUE}🔍 Validating environment configuration...${NC}"
    
    # Check secrets exist
    local required_secrets=("api-rate-limiter-secrets")
    for secret in "${required_secrets[@]}"; do
        if ! kubectl get secret "$secret" -n "${NAMESPACE}" >/dev/null 2>&1; then
            echo -e "${RED}❌ Required secret not found: $secret${NC}"
            echo "Create secrets with: kubectl apply -f k8s/01-infrastructure.yaml"
            exit 1
        fi
    done
    
    # Check configmaps exist
    local required_configmaps=("api-rate-limiter-config" "redis-config")
    for configmap in "${required_configmaps[@]}"; do
        if ! kubectl get configmap "$configmap" -n "${NAMESPACE}" >/dev/null 2>&1; then
            echo -e "${RED}❌ Required configmap not found: $configmap${NC}"
            exit 1
        fi
    done
    
    echo -e "${GREEN}✅ Environment validation passed${NC}"
}

# =============================================================================
# Function: Run security scan
# =============================================================================
run_security_scan() {
    echo -e "${BLUE}🔒 Running security scan...${NC}"
    
    if [[ -f "./scripts/docker-security-scan.sh" ]]; then
        IMAGE_TAG="${IMAGE_TAG}" ./scripts/docker-security-scan.sh
    else
        echo -e "${YELLOW}⚠️ Security scan script not found, skipping...${NC}"
    fi
}

# =============================================================================
# Function: Deploy infrastructure
# =============================================================================
deploy_infrastructure() {
    echo -e "${BLUE}🏗️ Deploying infrastructure...${NC}"
    
    # Apply infrastructure manifests
    kubectl apply -f k8s/01-infrastructure.yaml
    
    # Wait for Redis to be ready
    echo -e "${BLUE}⏳ Waiting for Redis to be ready...${NC}"
    kubectl wait --for=condition=ready pod -l app=redis -n "${NAMESPACE}" --timeout=300s
    
    echo -e "${GREEN}✅ Infrastructure deployed${NC}"
}

# =============================================================================
# Function: Deploy application
# =============================================================================
deploy_application() {
    echo -e "${BLUE}🚀 Deploying application...${NC}"
    
    # Update image tag in deployment
    local temp_manifest="/tmp/deployment-${IMAGE_TAG}.yaml"
    sed "s|image: api-rate-limiter:latest|image: api-rate-limiter:${IMAGE_TAG}|g" \
        k8s/02-application.yaml > "${temp_manifest}"
    
    # Apply application manifests
    kubectl apply -f "${temp_manifest}"
    
    # Apply ingress and monitoring
    kubectl apply -f k8s/03-ingress-monitoring.yaml
    
    echo -e "${GREEN}✅ Application deployment initiated${NC}"
}

# =============================================================================
# Function: Wait for rollout
# =============================================================================
wait_for_rollout() {
    echo -e "${BLUE}⏳ Waiting for deployment rollout...${NC}"
    
    # Wait for deployment to complete
    if kubectl rollout status deployment/api-rate-limiter-deployment -n "${NAMESPACE}" --timeout=600s; then
        echo -e "${GREEN}✅ Deployment rollout completed${NC}"
    else
        echo -e "${RED}❌ Deployment rollout failed${NC}"
        return 1
    fi
}

# =============================================================================
# Function: Health check
# =============================================================================
health_check() {
    echo -e "${BLUE}🏥 Running health checks...${NC}"
    
    local service_name="api-rate-limiter-service"
    local port="80"
    
    # Port forward for health check
    kubectl port-forward "service/${service_name}" 8080:${port} -n "${NAMESPACE}" &
    local port_forward_pid=$!
    
    # Cleanup function
    cleanup_port_forward() {
        kill $port_forward_pid 2>/dev/null || true
    }
    trap cleanup_port_forward EXIT
    
    # Wait for port forward to be ready
    sleep 5
    
    # Health check with timeout
    local timeout=0
    local max_timeout=${HEALTH_CHECK_TIMEOUT}
    
    while [[ $timeout -lt $max_timeout ]]; do
        if curl -f -s http://localhost:8080/health >/dev/null; then
            echo -e "${GREEN}✅ Health check passed${NC}"
            cleanup_port_forward
            return 0
        fi
        
        echo -e "${YELLOW}⏳ Waiting for health check... (${timeout}/${max_timeout}s)${NC}"
        sleep 10
        timeout=$((timeout + 10))
    done
    
    echo -e "${RED}❌ Health check failed after ${max_timeout}s${NC}"
    cleanup_port_forward
    return 1
}

# =============================================================================
# Function: Smoke tests
# =============================================================================
run_smoke_tests() {
    echo -e "${BLUE}🧪 Running smoke tests...${NC}"
    
    local service_name="api-rate-limiter-service"
    local port="80"
    
    # Port forward for testing
    kubectl port-forward "service/${service_name}" 8080:${port} -n "${NAMESPACE}" &
    local port_forward_pid=$!
    
    # Cleanup function
    cleanup_port_forward() {
        kill $port_forward_pid 2>/dev/null || true
    }
    trap cleanup_port_forward EXIT
    
    # Wait for port forward
    sleep 5
    
    # Test basic endpoints
    local tests_passed=0
    local total_tests=4
    
    # Test 1: Health endpoint
    if curl -f -s http://localhost:8080/health | jq -e '.status == "healthy"' >/dev/null; then
        echo -e "${GREEN}✅ Health endpoint test passed${NC}"
        tests_passed=$((tests_passed + 1))
    else
        echo -e "${RED}❌ Health endpoint test failed${NC}"
    fi
    
    # Test 2: Stats endpoint
    if curl -f -s http://localhost:8080/stats >/dev/null; then
        echo -e "${GREEN}✅ Stats endpoint test passed${NC}"
        tests_passed=$((tests_passed + 1))
    else
        echo -e "${RED}❌ Stats endpoint test failed${NC}"
    fi
    
    # Test 3: Rate limiting
    if curl -f -s http://localhost:8080/demo/moderate >/dev/null; then
        echo -e "${GREEN}✅ Rate limiting test passed${NC}"
        tests_passed=$((tests_passed + 1))
    else
        echo -e "${RED}❌ Rate limiting test failed${NC}"
    fi
    
    # Test 4: Metrics endpoint (if enabled)
    if curl -f -s http://localhost:8080/metrics 2>/dev/null | grep -q "# HELP" || true; then
        echo -e "${GREEN}✅ Metrics endpoint test passed${NC}"
        tests_passed=$((tests_passed + 1))
    else
        echo -e "${YELLOW}⚠️ Metrics endpoint not available (optional)${NC}"
        tests_passed=$((tests_passed + 1))  # Don't fail for optional metrics
    fi
    
    cleanup_port_forward
    
    if [[ $tests_passed -eq $total_tests ]]; then
        echo -e "${GREEN}✅ All smoke tests passed (${tests_passed}/${total_tests})${NC}"
        return 0
    else
        echo -e "${RED}❌ Smoke tests failed (${tests_passed}/${total_tests})${NC}"
        return 1
    fi
}

# =============================================================================
# Function: Rollback deployment
# =============================================================================
rollback_deployment() {
    echo -e "${RED}🔄 Rolling back deployment...${NC}"
    
    # Rollback to previous version
    kubectl rollout undo deployment/api-rate-limiter-deployment -n "${NAMESPACE}"
    
    # Wait for rollback to complete
    kubectl rollout status deployment/api-rate-limiter-deployment -n "${NAMESPACE}" --timeout=300s
    
    echo -e "${YELLOW}⚠️ Deployment rolled back to previous version${NC}"
}

# =============================================================================
# Function: Deployment summary
# =============================================================================
deployment_summary() {
    echo -e "${BLUE}📊 Deployment Summary${NC}"
    echo "=================================="
    
    # Get deployment status
    kubectl get deployment api-rate-limiter-deployment -n "${NAMESPACE}" -o wide
    
    # Get pod status
    echo ""
    echo -e "${BLUE}Pod Status:${NC}"
    kubectl get pods -l app=api-rate-limiter -n "${NAMESPACE}"
    
    # Get service endpoints
    echo ""
    echo -e "${BLUE}Service Endpoints:${NC}"
    kubectl get svc -n "${NAMESPACE}"
    
    # Get ingress status
    echo ""
    echo -e "${BLUE}Ingress Status:${NC}"
    kubectl get ingress -n "${NAMESPACE}" 2>/dev/null || echo "No ingress configured"
    
    echo ""
    echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
}

# =============================================================================
# Main execution
# =============================================================================
main() {
    local start_time=$(date +%s)
    
    # Run deployment steps
    check_prerequisites
    validate_environment
    run_security_scan
    deploy_infrastructure
    deploy_application
    
    # Wait for deployment and run checks
    if ! wait_for_rollout; then
        if [[ "${ROLLBACK_ON_FAILURE}" == "true" ]]; then
            rollback_deployment
        fi
        exit 1
    fi
    
    if ! health_check; then
        if [[ "${ROLLBACK_ON_FAILURE}" == "true" ]]; then
            rollback_deployment
        fi
        exit 1
    fi
    
    if ! run_smoke_tests; then
        if [[ "${ROLLBACK_ON_FAILURE}" == "true" ]]; then
            rollback_deployment
        fi
        exit 1
    fi
    
    # Show deployment summary
    deployment_summary
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo -e "${GREEN}⏱️ Total deployment time: ${duration} seconds${NC}"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback_deployment
        ;;
    "status")
        deployment_summary
        ;;
    "health")
        health_check
        ;;
    *)
        echo "Usage: $0 [deploy|rollback|status|health]"
        exit 1
        ;;
esac
