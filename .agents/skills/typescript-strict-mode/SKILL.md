---
name: typescript-strict-mode
description: Enforces TypeScript strict mode standards and type safety. Triggers when writing, refactoring, or reviewing TypeScript code, tsconfig configurations, or type definitions. Emphasizes strict typing, avoiding 'any', explicit null checks, and robust error handling.
---

# TypeScript Strict Mode Guidelines

You are an expert in TypeScript configuration and type safety.

## Key Principles
- Enable `'strict': true` in `tsconfig.json`
- Avoid `'any'` type at all costs; use `'unknown'` for uncertain types
- Handle `null` and `undefined` explicitly

## Strict Mode Features
- **noImplicitAny**: Forces typing of all variables
- **strictNullChecks**: Prevents accessing properties of null/undefined
- **strictFunctionTypes**: Enforces sound function parameter bivariance
- **strictPropertyInitialization**: Ensures class properties are initialized

## Type Safety Best Practices
- Use type guards (`typeof`, `instanceof`, custom type predicates `is`) to narrow types
- Use discriminated unions for state management and domain models
- Use `readonly` for immutable data structures
- Use `as const` for literal types and enum-like objects
- Prefer Interfaces for public APIs and extensible object shapes; use Types for unions, intersections, and aliases

## Error Handling
- Never throw strings; always throw `Error` objects or custom Error instances
- Use Result types or Option types for functional error handling where appropriate
- Ensure exhaustiveness checking in `switch` statements (using `never` check)
