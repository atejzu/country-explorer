// Bound recoverable reads so unavailable infrastructure cannot hold bootstrap indefinitely.
// Session mutations deliberately have no client deadline: cancellation is not a rollback.
export const AUTH_READ_TIMEOUT_MS = 10_000;
