# Example: Extract a large component safely

1. Identify sub-responsibilities (header, table, filters, dialogs).
2. Extract presentational pieces first (no data fetching).
3. Extract hooks for non-visual logic.
4. Keep props typed and stable.
5. After each extraction:
   - build
   - render the page
   - validate key interactions
