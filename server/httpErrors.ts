import type { ErrorRequestHandler } from "express";

// Never echo parser input, database errors or other exception messages to clients.
// Complete failed requests once, without forwarding their sensitive exception.
export const httpErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  const details = error && typeof error === "object" ? error : {};
  const candidate = details.status ?? details.statusCode;
  const status = Number.isInteger(candidate) && candidate >= 400 && candidate <= 599
    ? candidate : 500;
  const message = status === 400 && details.type === "entity.parse.failed"
    ? "Invalid JSON body"
    : status === 413
      ? "Request body too large"
      : status >= 500
        ? "Internal Server Error"
        : "Request failed";

  if (res.headersSent) {
    // Express must close a partially written response, but needs no sensitive cause.
    return next(Object.assign(new Error(message), { status }));
  }
  res.status(status).json({ message });
};
