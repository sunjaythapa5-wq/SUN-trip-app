const messages: Record<string, string> = {
  invalid_credentials: "That email and password combination was not recognised.",
  account_exists: "An account may already exist for that email. Try signing in instead.",
  check_email: "Check your email to confirm your account, then return to sign in.",
  confirmation_failed: "That confirmation link is invalid or has expired. Please try again.",
  invalid_form: "Enter a valid email and a password of at least 8 characters.",
  unexpected: "Authentication is temporarily unavailable. Please try again.",
};

export function authMessage(code: string | string[] | undefined) {
  const key = Array.isArray(code) ? code[0] : code;
  return key ? messages[key] : undefined;
}
