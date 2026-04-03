# SDKCopilot Runtime

Shared runtimes used by SDKCopilot-generated SDKs.

Website: [sdkcopilot.com](https://sdkcopilot.com)

SDKCopilot is a product of iNAV Canada Corp.

This repository is the public, source-available home for runtime behavior, transport concerns, and shared client execution logic.

The SDKCopilot generator is proprietary and is maintained separately by iNAV Canada Corp. This repository is the main place for:

- runtime bug reports
- runtime feature requests
- generator-output feedback that affects the runtime contract
- forks and custom runtime variants

Generated clients are expected to depend on the runtime package(s) published from this repository.

## Licensing

The code in this repository is public and may be modified to support application-specific behavior, custom integrations, and internal or commercial use cases that do not compete with SDKCopilot's products.

This repository is licensed under `PolyForm-Shield-1.0.0`. That makes the code source-available, but not open source in the OSI sense. See [LICENSE](./LICENSE) for the full terms.

## Layout

- `typescript/`: TypeScript runtime package, published as `@sdkcopilot/runtime`

Additional language runtimes can be added later under their own top-level folders.

## Scope

The runtime is responsible for generic SDK behavior such as:

- request execution
- URL construction
- body serialization
- response parsing
- auth/header/query wiring
- shared result and error types

Spec-specific typing, validators, operation files, and clients remain the responsibility of the generator.
