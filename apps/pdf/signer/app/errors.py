class SignerError(Exception):
    """A request the service refuses: answered with `status` and `{"error": code, "detail": detail}`."""

    def __init__(self, code: str, detail: str, status: int = 400):
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.status = status
