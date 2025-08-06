# 📁 Project Structure

```
📦 API Rate Limiter
├── 📄 README.md                     # Complete project documentation
├── 📄 package.json                  # Dependencies and scripts
├── 📄 tsconfig.json                 # TypeScript configuration
├── 📄 jest.config.js                # Testing configuration
├── 📄 Dockerfile                    # Docker container setup
├── 📄 docker-compose.yml            # Development environment
├── 📄 .env.example                  # Environment template
├── 📄 LICENSE                       # MIT license
│
├── 📂 src/                          # Source code
│   ├── 📄 index.ts                  # Main application entry
│   ├── 📂 middleware/               # Express middleware
│   ├── 📂 utils/                    # Utility functions
│   └── 📂 types/                    # TypeScript definitions
│
├── 📂 tests/                        # Test suites
│   ├── 📂 unit/                     # Unit tests
│   ├── 📂 integration/              # Integration tests
│   └── 📄 setup.ts                  # Test configuration
│
├── 📂 docker/                       # Docker configurations
│   ├── 📄 docker-compose.prod.yml   # Production setup
│   └── 📄 docker-compose.distributed.yml # Distributed setup
│
├── 📂 docs/                         # Documentation
│   ├── 📄 README.md                 # Documentation index
│   ├── 📄 REDIS_SETUP.md           # Redis configuration
│   └── 📄 TEST_RESULTS.md          # Test status
│
├── 📂 config/                       # Configuration files
│   ├── 📄 redis.conf               # Redis configuration
│   ├── 📄 haproxy.cfg              # Load balancer config
│   └── 📄 distributed-redis.yml    # Distributed Redis
│
├── 📂 scripts/                      # Utility scripts
│   ├── 📄 production-deploy.sh     # Deployment script
│   ├── 📄 production-setup.js      # Production setup
│   └── 📄 security-cli.js          # Security tools
│
├── 📂 k8s/                          # Kubernetes manifests
│   ├── 📄 01-infrastructure.yaml   # Infrastructure setup
│   ├── 📄 02-application.yaml      # Application deployment
│   └── 📄 03-ingress-monitoring.yaml # Ingress and monitoring
│
├── 📂 examples/                     # Code examples
│   └── 📄 distributed-integration.ts # Integration examples
│
├── 📂 public/                       # Static web assets
│   ├── 📄 dashboard.html           # Web dashboard
│   └── 📄 README.md               # Public assets info
│
└── 📂 .github/                     # GitHub configuration
    └── 📄 copilot-instructions.md  # AI coding guidelines
```

## 🎯 Key Directories

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| **`src/`** | Main application code | `index.ts`, middleware, utils |
| **`tests/`** | Test suites (73/73 passing) | Unit, integration, setup |
| **`docker/`** | Container orchestration | Production, distributed configs |
| **`docs/`** | Documentation | Setup guides, test results |
| **`config/`** | Configuration files | Redis, HAProxy, distributed |
| **`scripts/`** | Automation scripts | Deployment, setup, security |
| **`k8s/`** | Kubernetes deployment | Infrastructure, app, monitoring |
| **`examples/`** | Code examples | Integration samples |
| **`public/`** | Web dashboard | HTML, CSS, JS assets |

## 🚀 Quick Navigation

- **📖 Complete Documentation**: [README.md](./README.md)
- **⚡ Quick Start**: [README.md#quick-start](./README.md#-quick-start)
- **🔧 Development**: `npm run dev`
- **🧪 Testing**: `npm test`
- **🐳 Docker**: `docker-compose up -d`
- **📊 Dashboard**: `http://localhost:3000/dashboard`
