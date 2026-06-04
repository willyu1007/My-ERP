# Example: Virtualize large lists

## Use when
- list length is large (hundreds/thousands)
- scrolling is janky
- rendering all rows is expensive

## Pattern
- Use a virtualization library or windowing technique.
- Keep row components simple and memoized if needed.
- Pre-compute row heights where possible.

## Acceptance criteria
- Smooth scrolling on target devices.
- No unnecessary data refetch on scroll.
