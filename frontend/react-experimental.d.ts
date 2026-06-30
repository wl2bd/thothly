// Opt the whole project into React's experimental type surface so
// `import { ViewTransition } from "react"` type-checks. The runtime export comes
// from Next's bundled react-experimental, enabled via experimental.viewTransition
// in next.config.ts; this only adds the matching types.
/// <reference types="react/experimental" />
