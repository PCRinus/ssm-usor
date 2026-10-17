import base64
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from pyhanko.pdf_utils.reader import PdfFileReader

from app.forms import form_fields
from app.main import app

from .fixtures import CertificateAuthority, Identity, row_fields, sheet, signature_fields

client = TestClient(app)
authority = CertificateAuthority()
trainee = authority.issue('Ana Ștefănescu')
trainer = authority.issue('Ion Țurcanu')


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode('ascii')


def unb64(text: str) -> bytes:
    return base64.b64decode(text)


def post(route: str, body: dict, status: int = 200) -> dict:
    response = client.post(route, json=body)
    assert response.status_code == status, response.text
    return response.json()


def prepared_sheet() -> bytes:
    return unb64(
        post('/prepare-sheet', {'pdf': b64(sheet()), 'signatureFields': signature_fields()})['pdf']
    )


def fill(pdf: bytes, values: dict[str, str]) -> bytes:
    return unb64(post('/fill', {'pdf': b64(pdf), 'values': values})['pdf'])


def fill_row(pdf: bytes, row: int) -> bytes:
    return fill(
        pdf,
        {f'row{row}_date': f'1{row}.10.2026', f'row{row}_theme': 'Instruire periodică: șantier'},
    )


def sign(pdf: bytes, identity: Identity, field: str, row: int, certify: bool = False) -> bytes:
    begun = post(
        '/sign/begin',
        {
            'pdf': b64(pdf),
            'field': field,
            'certificatePem': identity.certificate_pem,
            'chainPem': identity.chain_pem,
            'reason': 'Instruire periodică',
            'signedAt': '2026-10-18T09:30:00+03:00',
            'certify': certify,
            'lockFields': row_fields(row),
            'appearanceLines': [identity.name, '18.10.2026 09:30'],
        },
    )
    signature = identity.sign(unb64(begun['toSign']))
    finished = post(
        '/sign/finish',
        {
            'prepared': begun['prepared'],
            'sessionToken': begun['sessionToken'],
            'signature': b64(signature),
        },
    )
    return unb64(finished['pdf'])


def validate(pdf: bytes) -> list[dict]:
    return post('/validate', {'pdf': b64(pdf)})['signatures']


def test_health():
    assert client.get('/health').json() == {'status': 'ok'}


def test_prepare_sheet_turns_the_named_text_fields_into_signature_fields():
    fields = form_fields(PdfFileReader(BytesIO(prepared_sheet())))
    for name, field in fields.items():
        assert field.field_type == ('/Sig' if name in signature_fields() else '/Tx'), name
    assert '/AP' in fields['row1_trainee'].widgets[0]

    refused = post(
        '/prepare-sheet', {'pdf': b64(sheet()), 'signatureFields': ['row9_trainee']}, 400
    )
    assert refused['error'] == 'unknown_fields'


def test_prepare_sheet_names_the_fields_by_their_tooltips_first():
    titled = unb64(
        post(
            '/prepare-sheet',
            {'pdf': b64(sheet(titled=True)), 'signatureFields': signature_fields()},
        )['pdf']
    )
    fields = form_fields(PdfFileReader(BytesIO(titled)))
    assert sorted(fields) == sorted(form_fields(PdfFileReader(BytesIO(prepared_sheet()))))
    assert all('/TU' not in field.dictionary for field in fields.values())
    assert fields['row1_trainee'].field_type == '/Sig'
    assert fields['row1_date'].field_type == '/Tx'
    assert '/V' not in fields['row1_date'].dictionary
    pdf = sign(fill_row(titled, 1), trainee, 'row1_trainee', 1, certify=True)
    assert validate(pdf)[0]['modificationsPermitted']


def test_fill_writes_values_with_appearances_and_refuses_unknown_names():
    pdf = fill_row(prepared_sheet(), 1)
    field = form_fields(PdfFileReader(BytesIO(pdf)))['row1_theme']
    assert field.dictionary['/V'] == 'Instruire periodică: șantier'
    assert '/AP' in field.widgets[0]

    refused = post('/fill', {'pdf': b64(pdf), 'values': {'row9_date': 'x'}}, 400)
    assert refused['error'] == 'unknown_fields'


def test_a_two_phase_signature_validates():
    pdf = sign(fill_row(prepared_sheet(), 1), trainee, 'row1_trainee', 1, certify=True)
    [result] = validate(pdf)
    assert result == {
        'field': 'row1_trainee',
        'signerName': 'Ana Ștefănescu',
        'signedAt': '2026-10-18T09:30:00+03:00',
        'intact': True,
        'modificationsPermitted': True,
        'certified': True,
    }


def test_later_rows_and_signatures_keep_the_certification_valid():
    pdf = fill_row(prepared_sheet(), 1)
    pdf = sign(pdf, trainee, 'row1_trainee', 1, certify=True)
    pdf = sign(pdf, trainer, 'row1_trainer', 1)
    pdf = fill_row(pdf, 2)
    pdf = sign(pdf, trainee, 'row2_trainee', 2)

    results = validate(pdf)
    assert [r['field'] for r in results] == ['row1_trainee', 'row1_trainer', 'row2_trainee']
    assert [r['certified'] for r in results] == [True, False, False]
    assert all(r['intact'] and r['modificationsPermitted'] for r in results), results


def test_a_change_to_a_locked_row_is_not_permitted():
    pdf = fill_row(prepared_sheet(), 1)
    pdf = sign(pdf, trainee, 'row1_trainee', 1, certify=True)
    pdf = sign(pdf, trainer, 'row1_trainer', 1)
    pdf = fill(pdf, {'row1_theme': 'Altă temă'})

    results = validate(pdf)
    assert all(r['intact'] for r in results)
    assert [r['modificationsPermitted'] for r in results] == [False, False]


def test_only_the_first_signature_certifies():
    pdf = sign(fill_row(prepared_sheet(), 1), trainee, 'row1_trainee', 1, certify=True)
    begun = post(
        '/sign/begin',
        {
            'pdf': b64(pdf),
            'field': 'row1_trainer',
            'certificatePem': trainer.certificate_pem,
            'chainPem': trainer.chain_pem,
            'reason': '',
            'signedAt': '2026-10-18T09:30:00+03:00',
            'certify': True,
            'lockFields': [],
            'appearanceLines': [],
        },
        400,
    )
    assert begun['error'] == 'cannot_certify'


@pytest.fixture
def begun() -> dict:
    return post(
        '/sign/begin',
        {
            'pdf': b64(fill_row(prepared_sheet(), 1)),
            'field': 'row1_trainee',
            'certificatePem': trainee.certificate_pem,
            'chainPem': trainee.chain_pem,
            'reason': 'Instruire',
            'signedAt': '2026-10-18T09:30:00Z',
            'certify': True,
            'lockFields': row_fields(1),
            'appearanceLines': ['Ana Ștefănescu'],
        },
    )


def finish(begun: dict, **overrides) -> dict:
    body = {
        'prepared': begun['prepared'],
        'sessionToken': begun['sessionToken'],
        'signature': b64(trainee.sign(unb64(begun['toSign']))),
    }
    return {**body, **overrides}


def test_finish_refuses_an_unknown_session(begun):
    assert (
        post('/sign/finish', finish(begun, sessionToken='nope'), 404)['error'] == 'unknown_session'
    )


def test_finish_refuses_a_signature_by_another_key(begun):
    wrong = b64(trainer.sign(unb64(begun['toSign'])))
    assert post('/sign/finish', finish(begun, signature=wrong), 400)['error'] == 'bad_signature'


def test_finish_refuses_a_prepared_pdf_that_changed(begun):
    prepared = bytearray(unb64(begun['prepared']))
    prepared[20] ^= 1
    assert (
        post('/sign/finish', finish(begun, prepared=b64(bytes(prepared))), 400)['error']
        == 'prepared_changed'
    )


def test_a_session_finishes_once(begun):
    post('/sign/finish', finish(begun))
    assert post('/sign/finish', finish(begun), 404)['error'] == 'unknown_session'


def test_a_malformed_request_is_refused_without_its_input():
    pdf = b64(b'%PDF-1.7 Ana Stefanescu')
    refused = post('/fill', {'pdf': pdf}, 422)
    assert refused['error'] == 'malformed_request'
    assert 'values' in refused['detail']
    assert pdf not in str(refused)


def test_a_file_that_is_not_a_pdf_is_refused():
    assert post('/fill', {'pdf': b64(b'not a pdf'), 'values': {}}, 400)['error'] == 'not_a_pdf'
