# Example: Common async pitfalls

## Fire-and-forget without tracking
- Background async work can fail silently.
- If you must use fire-and-forget, add explicit logging/tracking and consider a job queue.

## Swallowing errors
- Catching and not rethrowing can produce false success responses.
- Only swallow errors when the workflow explicitly tolerates the failure and the behavior is documented.

## Returning before awaiting
- Ensure you `await` persistence and side-effectful operations when the API contract requires them.
