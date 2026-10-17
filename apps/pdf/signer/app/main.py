import base64
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from pyhanko.pdf_utils.layout import LayoutError
from pyhanko.pdf_utils.misc import FormFillingError, PdfError

from . import forms, signing, validation
from .errors import SignerError

# An untrusted chain is the expected case here (the app is its own authority), and pyHanko logs
# it as a warning with a traceback for every signature it validates.
logging.getLogger('pyhanko').setLevel(logging.ERROR)
logging.getLogger('fontTools').setLevel(logging.ERROR)

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class Body(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, extra='forbid')


class PrepareSheet(Body):
    pdf: str
    signature_fields: list[str] = Field(min_length=1)


class Fill(Body):
    pdf: str
    values: dict[str, str]


class BeginSignature(Body):
    pdf: str
    field: str
    certificate_pem: str
    chain_pem: list[str]
    reason: str
    signed_at: str
    certify: bool
    lock_fields: list[str]
    appearance_lines: list[str]


class FinishSignature(Body):
    prepared: str
    session_token: str
    signature: str


class Validate(Body):
    pdf: str


def decode(name: str, value: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except ValueError as error:
        raise SignerError('bad_base64', f'{name} is not base64.') from error


def encode(data: bytes) -> str:
    return base64.b64encode(data).decode('ascii')


@app.exception_handler(SignerError)
async def refused(_: Request, error: SignerError) -> JSONResponse:
    return JSONResponse({'error': error.code, 'detail': error.detail}, status_code=error.status)


@app.exception_handler(PdfError)
@app.exception_handler(FormFillingError)
@app.exception_handler(LayoutError)
async def unprocessable(_: Request, error: Exception) -> JSONResponse:
    return JSONResponse({'error': 'unprocessable_pdf', 'detail': str(error)[:300]}, status_code=400)


@app.exception_handler(RequestValidationError)
async def malformed(_: Request, error: RequestValidationError) -> JSONResponse:
    # Without the input FastAPI would echo, which is a PDF of personal data and ends up in logs.
    problems = '; '.join(
        f'{".".join(str(part) for part in issue["loc"])}: {issue["msg"]}'
        for issue in error.errors()
    )
    return JSONResponse({'error': 'malformed_request', 'detail': problems}, status_code=422)


@app.get('/health')
async def health() -> dict:
    return {'status': 'ok'}


@app.post('/prepare-sheet')
def prepare_sheet(body: PrepareSheet) -> dict:
    pdf = forms.prepare_sheet(decode('pdf', body.pdf), body.signature_fields)
    return {'pdf': encode(pdf)}


@app.post('/fill')
def fill(body: Fill) -> dict:
    pdf = forms.fill_fields(decode('pdf', body.pdf), body.values)
    return {'pdf': encode(pdf)}


@app.post('/sign/begin')
async def begin_signature(body: BeginSignature) -> dict:
    prepared, to_sign, token = await signing.begin_signature(
        decode('pdf', body.pdf),
        signing.BeginOptions(
            field=body.field,
            certificate_pem=body.certificate_pem,
            chain_pem=body.chain_pem,
            reason=body.reason,
            signed_at=body.signed_at,
            certify=body.certify,
            lock_fields=body.lock_fields,
            appearance_lines=body.appearance_lines,
        ),
    )
    return {'prepared': encode(prepared), 'toSign': encode(to_sign), 'sessionToken': token}


@app.post('/sign/finish')
async def finish_signature(body: FinishSignature) -> dict:
    pdf = await signing.finish_signature(
        decode('prepared', body.prepared),
        body.session_token,
        decode('signature', body.signature),
    )
    return {'pdf': encode(pdf)}


@app.post('/validate')
async def validate(body: Validate) -> dict:
    return {'signatures': await validation.validate(decode('pdf', body.pdf))}
