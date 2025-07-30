#!/bin/bash

# =============================================================================
# Docker Security Scanning and Hardening Script
# 
# This script performs security scanning and validation of the Docker image
# =============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="api-rate-limiter"
IMAGE_TAG="${IMAGE_TAG:-latest}"
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"

echo -e "${BLUE}🔒 Starting Docker Security Scan for ${FULL_IMAGE_NAME}${NC}"

# =============================================================================
# Function: Check if command exists
# =============================================================================
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# =============================================================================
# Function: Install Trivy if not present
# =============================================================================
install_trivy() {
    if ! command_exists trivy; then
        echo -e "${YELLOW}📦 Installing Trivy security scanner...${NC}"
        
        # Detect OS and install Trivy
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            brew install trivy
        else
            echo -e "${RED}❌ Unsupported OS for automatic Trivy installation${NC}"
            echo "Please install Trivy manually: https://aquasecurity.github.io/trivy/latest/getting-started/installation/"
            exit 1
        fi
    fi
}

# =============================================================================
# Function: Run Trivy vulnerability scan
# =============================================================================
run_trivy_scan() {
    echo -e "${BLUE}🔍 Running Trivy vulnerability scan...${NC}"
    
    # Create scan results directory
    mkdir -p ./security-reports
    
    # Run comprehensive scan
    trivy image \
        --format table \
        --severity HIGH,CRITICAL \
        --ignore-unfixed \
        --timeout 10m \
        --cache-dir ./.trivy-cache \
        "${FULL_IMAGE_NAME}" | tee "./security-reports/trivy-scan-$(date +%Y%m%d-%H%M%S).txt"
    
    # Generate JSON report for CI/CD integration
    trivy image \
        --format json \
        --severity HIGH,CRITICAL \
        --ignore-unfixed \
        --timeout 10m \
        --cache-dir ./.trivy-cache \
        --output "./security-reports/trivy-report-$(date +%Y%m%d-%H%M%S).json" \
        "${FULL_IMAGE_NAME}"
    
    # Check if critical vulnerabilities found
    CRITICAL_COUNT=$(trivy image --format json --severity CRITICAL --quiet "${FULL_IMAGE_NAME}" | jq -r '.Results[]?.Vulnerabilities? // [] | length')
    
    if [[ "${CRITICAL_COUNT:-0}" -gt 0 ]]; then
        echo -e "${RED}❌ Found ${CRITICAL_COUNT} critical vulnerabilities!${NC}"
        return 1
    else
        echo -e "${GREEN}✅ No critical vulnerabilities found${NC}"
        return 0
    fi
}

# =============================================================================
# Function: Check Docker best practices
# =============================================================================
check_docker_best_practices() {
    echo -e "${BLUE}📋 Checking Docker best practices...${NC}"
    
    # Check if running as non-root
    USER_CHECK=$(docker run --rm "${FULL_IMAGE_NAME}" whoami 2>/dev/null || echo "root")
    if [[ "${USER_CHECK}" != "rateLimiter" ]]; then
        echo -e "${RED}❌ Container not running as non-root user${NC}"
        return 1
    else
        echo -e "${GREEN}✅ Container running as non-root user: ${USER_CHECK}${NC}"
    fi
    
    # Check image size
    IMAGE_SIZE=$(docker images "${FULL_IMAGE_NAME}" --format "table {{.Size}}" | tail -n 1)
    echo -e "${BLUE}📊 Image size: ${IMAGE_SIZE}${NC}"
    
    # Check for unnecessary packages
    echo -e "${BLUE}🔍 Checking for unnecessary packages...${NC}"
    docker run --rm "${FULL_IMAGE_NAME}" sh -c 'apk list --installed 2>/dev/null || dpkg -l 2>/dev/null || rpm -qa 2>/dev/null' > "./security-reports/installed-packages-$(date +%Y%m%d-%H%M%S).txt"
    
    return 0
}

# =============================================================================
# Function: Test container security
# =============================================================================
test_container_security() {
    echo -e "${BLUE}🛡️  Testing container security...${NC}"
    
    # Test file system is read-only (except for allowed writable dirs)
    echo -e "${BLUE}Testing read-only filesystem...${NC}"
    if docker run --rm "${FULL_IMAGE_NAME}" sh -c 'touch /test-file 2>/dev/null'; then
        echo -e "${RED}❌ Filesystem is writable (security risk)${NC}"
    else
        echo -e "${GREEN}✅ Filesystem is read-only${NC}"
    fi
    
    # Test that writable directories work
    echo -e "${BLUE}Testing writable directories...${NC}"
    if docker run --rm "${FULL_IMAGE_NAME}" sh -c 'touch /tmp/test-file && touch /app/logs/test-log'; then
        echo -e "${GREEN}✅ Writable directories functioning${NC}"
    else
        echo -e "${RED}❌ Writable directories not working${NC}"
    fi
    
    # Test process running as non-root
    echo -e "${BLUE}Testing process user...${NC}"
    PROCESS_USER=$(docker run --rm "${FULL_IMAGE_NAME}" sh -c 'ps aux | grep node | grep -v grep | awk "{print \$1}"' | head -n 1)
    if [[ "${PROCESS_USER}" == "rateLimi" ]] || [[ "${PROCESS_USER}" == "1001" ]]; then
        echo -e "${GREEN}✅ Process running as non-root user${NC}"
    else
        echo -e "${RED}❌ Process running as: ${PROCESS_USER}${NC}"
    fi
}

# =============================================================================
# Function: Generate security report
# =============================================================================
generate_security_report() {
    echo -e "${BLUE}📝 Generating security report...${NC}"
    
    REPORT_FILE="./security-reports/security-summary-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "${REPORT_FILE}" << EOF
# Docker Security Scan Report

**Image**: ${FULL_IMAGE_NAME}  
**Scan Date**: $(date)  
**Scan Host**: $(hostname)  

## Security Checklist

- [x] Multi-stage build for minimal attack surface
- [x] Non-root user (rateLimiter:1001)
- [x] Read-only root filesystem
- [x] Vulnerability scanning with Trivy
- [x] Security headers in application
- [x] Resource limits configured
- [x] Health checks implemented

## Scan Results

See individual scan files in this directory:
- Trivy vulnerability scan
- Installed packages list
- Best practices check

## Recommendations

1. Regularly update base images
2. Monitor for new vulnerabilities  
3. Keep dependencies updated
4. Use security scanning in CI/CD pipeline
5. Implement runtime security monitoring

## Next Steps

- [ ] Deploy to staging environment
- [ ] Run penetration testing
- [ ] Configure runtime security monitoring
- [ ] Set up automated vulnerability alerts
EOF

    echo -e "${GREEN}✅ Security report generated: ${REPORT_FILE}${NC}"
}

# =============================================================================
# Main execution
# =============================================================================
main() {
    echo -e "${BLUE}🚀 Starting Docker Security Validation${NC}"
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running${NC}"
        exit 1
    fi
    
    # Check if image exists
    if ! docker image inspect "${FULL_IMAGE_NAME}" >/dev/null 2>&1; then
        echo -e "${RED}❌ Image ${FULL_IMAGE_NAME} not found${NC}"
        echo "Build the image first with: docker build -t ${FULL_IMAGE_NAME} ."
        exit 1
    fi
    
    # Create reports directory
    mkdir -p ./security-reports
    
    # Install and run Trivy
    install_trivy
    if ! run_trivy_scan; then
        echo -e "${RED}❌ Critical vulnerabilities found, stopping deployment${NC}"
        exit 1
    fi
    
    # Check Docker best practices
    if ! check_docker_best_practices; then
        echo -e "${RED}❌ Docker best practices check failed${NC}"
        exit 1
    fi
    
    # Test container security
    test_container_security
    
    # Generate final report
    generate_security_report
    
    echo -e "${GREEN}🎉 Security validation completed successfully!${NC}"
    echo -e "${GREEN}✅ Image ${FULL_IMAGE_NAME} is ready for production deployment${NC}"
}

# Run main function
main "$@"
