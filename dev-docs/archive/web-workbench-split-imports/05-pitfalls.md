# 05 - Pitfalls

- Do not import `@willyu1007/web-workbench/dist/*` or `@willyu1007/web-workbench/components/*`; those paths are
  private layout details.
- Do not remove the root package entry in this slice; external consumers may still depend on it.
- Do not mix this task with finance behavior or authorization changes.
- Do not overwrite unrelated dirty work in daily accounting, payments, layout, or template CSS.
