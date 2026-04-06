const APPROVED_GITHUB_LOGIN_SPLIT_PATTERN = /[\n,]/;

export function getApprovedGitHubLogins(rawValue: string | undefined = process.env.APPROVED_GITHUB_LOGINS): string[] {
  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(APPROVED_GITHUB_LOGIN_SPLIT_PATTERN)
    .map((login) => login.trim().toLowerCase())
    .filter((login) => login.length > 0);
}

export function isGitHubLoginApproved(login: string, rawValue?: string): boolean {
  const normalizedLogin = login.trim().toLowerCase();
  if (!normalizedLogin) {
    return false;
  }

  return getApprovedGitHubLogins(rawValue).includes(normalizedLogin);
}
