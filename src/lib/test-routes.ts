export function areTestRoutesEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return process.env.ENABLE_TEST_ROUTES === "true";
  }
  return true;
}
