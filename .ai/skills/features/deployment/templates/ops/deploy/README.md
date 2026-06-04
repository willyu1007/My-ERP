# Deploy

Goal: take packaged artifacts and run them in target environments.

Repository layout:
- ops/deploy/http_services/  Deployment descriptors for long-running services
- ops/deploy/workloads/      Deployment descriptors for jobs/event-driven workloads
- ops/deploy/clients/        Deployment descriptors for client apps (web/mobile/desktop)
- ops/deploy/scripts/        Shared deploy/rollback scripts (preferred entry points)
- ops/deploy/handbook/       Runbooks and deployment history

Guidelines:
- Capture environment-specific parameters explicitly.
- Keep rollback paths documented and tested.

