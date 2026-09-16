export class ApiError extends Error {
  constructor(readonly code: 'unauthorized' | 'service_unavailable') {
    super(code);
    this.name = 'ApiError';
  }
}
