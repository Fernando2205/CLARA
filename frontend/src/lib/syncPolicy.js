export function isPermanentSaveError (error) {
  return Number.isInteger(error?.status) &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
}
