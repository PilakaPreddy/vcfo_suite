/**
 * The text a route handler may put in an error response body.
 *
 * Our own code throws errors with sentences written for the user ("Not permitted",
 * "Only firm admins can delete projects"), and the UI shows them. A database, driver, SDK or
 * runtime error can carry SQL, hostnames or stack detail, so it is logged on the server and the
 * client only gets the fixed `code`.
 */
export function publicErrorMessage(err: unknown, code: string): string {
  if (isOwnError(err)) return err.message;
  console.error(`[api] ${code}`, err);
  return code;
}

const RUNTIME_ERRORS = [TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError, AggregateError];
// Fields that pg (severity, routine), the AWS SDK ($metadata), Node system calls (syscall, errno)
// and zod (issues) put on their errors; our own error classes never use them.
const FOREIGN_FIELDS = ['severity', 'routine', '$metadata', 'syscall', 'errno', 'issues'];

function isOwnError(err: unknown): err is Error {
  if (!(err instanceof Error) || !err.message.trim()) return false;
  if (RUNTIME_ERRORS.some((C) => err instanceof C)) return false;
  if (FOREIGN_FIELDS.some((field) => field in err)) return false;
  // Drizzle wraps the driver error as `cause` and puts the SQL in the message.
  return !(err.cause instanceof Error);
}
