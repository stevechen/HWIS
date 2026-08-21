# ADR-0010: Centralized Authorization Model

## Status

Accepted

## Context

HWIS serves users across diverse roles (`super`, `admin`, `teacher`, `student`) and operating states (`pending`/`active` staff status, `Enrolled`/`Not Enrolled` student status). Without a centralized authorization model, authorization logic risks becoming fragmented between Convex backend mutations/queries and frontend Svelte components, leading to security vulnerabilities or UI/server state divergence.

## Decision

All authorization decisions are governed by a centralized, pure-function policy module in `src/convex/shared/authorization.ts`.

- **Standardized Identity Representations**:
  - `AccessSubject`: Minimal normalized identity interface containing `role`, `status`, and `enrollmentStatus`, assignable from both backend user records (`Doc<'users'>`) and the frontend Svelte viewer shape.
  - `AuthorizationActor`: Tagged union representing identity kinds (`anonymous`, `staff`, `student`).
- **Pure Capability Functions**:
  - Capabilities and access checks are expressed as pure functions, such as `getEvaluationCapabilities`, `canAccessAdminArea`, `canReadTeacherHistory`, `requireActiveStaff`, and `requireAdminForSensitiveOperation`.
- **Single Source of Truth**:
  - Convex backend mutations and queries enforce policies authoritatively using these pure functions (e.g., `requireEvaluationRead`, `requireEvaluationEdit`, `requireEvaluationDelete`, `requireActiveStaff`, `requireAdminForSensitiveOperation`).
  - Frontend Svelte views and route guards import the exact same pure policy functions to gate UI controls (buttons, navigation links, views), eliminating duplicative client-side authorization rules.

## Implementation & Consequences

### Implementation

- `src/convex/shared/authorization.ts`: Contains types (`Role`, `UserStatus`, `StudentStatus`, `AccessSubject`, `AuthorizationActor`, `EvaluationCapabilities`) and pure predicate functions (`isAdmin`, `isSuper`, `isActiveStaff`, `canAccessAdminArea`, `canReadTeacherHistory`, `getEvaluationCapabilities`, `requireEvaluationEdit`, etc.).
- `src/convex/auth.ts`: Provides context-aware auth helpers (`requireActiveStaff`, `requireAdminForSensitiveOperation`) that resolve the viewer identity and delegate to authorization predicate functions.
- **Frontend Integration**: Svelte route guards and components import `AccessSubject` predicates directly from `src/convex/shared/authorization.ts` to derive visibility of administrative controls and navigation items.

### Consequences

- **Zero UI / Server Divergence**: The frontend and backend evaluate access against identical pure policy functions.
- **High Testability**: Pure authorization functions can be comprehensively unit tested in isolation without mocking databases or network calls.
- **Robust Security**: Convex mutations remain the authoritative gatekeepers (ADR-0002), ensuring client-side UI tampering cannot bypass security checks.
