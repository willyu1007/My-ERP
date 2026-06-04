# Example: Error → Fix mapping

## Error
`TS2339: Property 'onClick' does not exist on type 'ButtonProps'.`

## Likely root cause
The props interface does not match component usage.

## Fix
- Add the missing prop to the interface:
  - `onClick?: () => void`
- Or remove the prop usage if it is invalid for this component.

## Verify
Re-run the TypeScript check until clean.
