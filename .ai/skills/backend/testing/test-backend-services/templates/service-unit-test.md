# Template: Service unit test checklist

- [ ] Arrange dependencies with mocks (repository, external clients).
- [ ] Act by calling a service method.
- [ ] Assert on:
  - returned value
  - repository calls (arguments, count)
  - thrown error type/code for failure paths
