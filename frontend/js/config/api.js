/**
 * JOB RUSH — API client.
 * Every network call in the app goes through this module. Centralizes
 * the base URL, credentials (cookies for the session), and turns
 * non-2xx responses into a consistent error shape so pages never have
 * to duplicate response-parsing/error-handling logic.
 */
const API = (function () {
  const BASE_URL = 'http://127.0.0.1:4000/api';

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  async function request(path, { method = 'GET', body, headers = {}, isFormData = false } = {}) {
    const opts = {
      method,
      credentials: 'include', // sends the httpOnly session cookie
      headers: isFormData ? headers : { 'Content-Type': 'application/json', ...headers },
    };
    if (body) opts.body = isFormData ? body : JSON.stringify(body);

    let response;
    try {
      response = await fetch(`${BASE_URL}${path}`, opts);
    } catch (networkErr) {
      throw new ApiError('Could not reach the server. Check your connection and try again.', 0, 'NETWORK_ERROR');
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // Some endpoints (204s) have no body — that's fine.
    }

    if (!response.ok) {
      throw new ApiError(
        payload?.error || 'Something went wrong. Please try again.',
        response.status,
        payload?.code || 'UNKNOWN_ERROR'
      );
    }

    return payload;
  }

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body }),
    patch: (path, body) => request(path, { method: 'PATCH', body }),
    put: (path, body) => request(path, { method: 'PUT', body }),
    delete: (path) => request(path, { method: 'DELETE' }),
    upload: (path, formData) => request(path, { method: 'POST', body: formData, isFormData: true }),
    ApiError,
  };
})();
