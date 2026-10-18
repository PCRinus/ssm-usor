import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.diff_analysis import DEFAULT_DIFF_POLICY
from pyhanko.sign.fields import FieldMDPAction, FieldMDPSpec
from pyhanko.sign.validation.pdf_embedded import async_validate_pdf_signature
from pyhanko_certvalidator import ValidationContext

from app import forms
from app.forms import MULTILINE, Field, form_fields, locked_by_signatures
from app.main import app

from .fixtures import CertificateAuthority, Identity, row_fields, sheet, signature_fields

client = TestClient(app)
authority = CertificateAuthority()
trainee = authority.issue('Ana Ștefănescu', account_id='5f0c3a8e-0d7e-4c55-9d38-1f2a7c9b6e41')
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


def begin_body(
    pdf: bytes, identity: Identity, field: str, lock_fields: list[str], certify: bool = False
) -> dict:
    return {
        'pdf': b64(pdf),
        'field': field,
        'certificatePem': identity.certificate_pem,
        'chainPem': identity.chain_pem,
        'reason': 'Instruire periodică',
        'signedAt': '2026-10-18T09:30:00+03:00',
        'certify': certify,
        'lockFields': lock_fields,
        'appearanceLines': [identity.name, '18.10.2026 09:30'],
    }


def sign(
    pdf: bytes,
    identity: Identity,
    field: str,
    row: int | None = None,
    certify: bool = False,
    lock_fields: list[str] | None = None,
) -> bytes:
    lock_fields = row_fields(row) if lock_fields is None else lock_fields
    begun = post('/sign/begin', begin_body(pdf, identity, field, lock_fields, certify))
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


def serial_of(identity: Identity) -> str:
    serial = identity.certificate.serial_number
    return serial.to_bytes((serial.bit_length() + 7) // 8, 'big').hex()


def validate(pdf: bytes, roots: list[str] | None = None) -> list[dict]:
    body = {'pdf': b64(pdf)} if roots is None else {'pdf': b64(pdf), 'trustRootsPem': roots}
    return post('/validate', body)['signatures']


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


def test_fill_sets_a_text_too_long_for_its_field_smaller_so_that_every_line_shows():
    lines = '\n'.join(['Instruire periodică: șantier'] * 5)
    pdf = fill(prepared_sheet(), {'row1_theme': lines, 'row1_date': '11.10.2026'})
    fields = form_fields(PdfFileReader(BytesIO(pdf)))

    def size(name: str) -> int:
        stream = fields[name].widgets[0]['/AP']['/N'].get_object().data
        return int(stream.split(b' Tf')[0].split()[-1])

    assert size('row1_date') == 9
    assert size('row1_theme') == 3


def test_fill_tells_apple_the_size_it_drew_and_whether_the_value_has_several_lines():
    pdf = fill(prepared_sheet(), {'row1_theme': 'Instruire\nperiodică', 'row1_date': '11.10.2026'})
    fields = form_fields(PdfFileReader(BytesIO(pdf)))
    for name, multiline in (('row1_theme', True), ('row1_date', False)):
        field = fields[name]
        stream = field.widgets[0]['/AP']['/N'].get_object().data
        drawn = stream.split(b' Tf')[0].split()[-1].decode()
        assert f' {drawn} Tf' in str(field.dictionary['/DA']), name
        assert bool(int(field.dictionary.get('/Ff', 0)) & MULTILINE) is multiline, name

    pdf = fill(pdf, {'row1_theme': 'Instruire periodică'})
    theme = form_fields(PdfFileReader(BytesIO(pdf)))['row1_theme']
    assert not int(theme.dictionary.get('/Ff', 0)) & MULTILINE


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
        'trusted': False,
        'certificateSerial': serial_of(trainee),
        'issuer': 'O=SSM Ușor test,CN=SSM Ușor test CA',
        'subjectSerialNumber': '5f0c3a8e-0d7e-4c55-9d38-1f2a7c9b6e41',
        'coverage': 'entire',
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


def test_a_change_to_a_locked_row_is_not_permitted(monkeypatch):
    pdf = fill_row(prepared_sheet(), 1)
    pdf = sign(pdf, trainee, 'row1_trainee', 1, certify=True)
    pdf = sign(pdf, trainer, 'row1_trainer', 1)
    monkeypatch.setattr(forms, 'locked_by_signatures', lambda fields: set())
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


def row_values(row: int) -> dict[str, str]:
    return {name: 'x' for name in row_fields(row)}


def test_fill_refuses_a_field_a_signature_locks_and_fills_another_row():
    pdf = sign(fill_row(prepared_sheet(), 1), trainee, 'row1_trainee', 1, certify=True)

    refused = post('/fill', {'pdf': b64(pdf), 'values': {'row1_theme': 'Altă temă'}}, 409)
    assert refused == {'error': 'locked_field', 'detail': 'row1_theme'}
    refused = post('/fill', {'pdf': b64(pdf), 'values': row_values(1) | row_values(2)}, 409)
    assert refused == {'error': 'locked_field', 'detail': 'row1_date, row1_theme'}

    [first] = validate(fill_row(pdf, 2))
    assert first['intact'] and first['modificationsPermitted']


def signed_field(name: str, lock: FieldMDPSpec) -> Field:
    reference = generic.DictionaryObject(
        {
            generic.pdf_name('/TransformMethod'): generic.pdf_name('/FieldMDP'),
            generic.pdf_name('/TransformParams'): lock.as_transform_params(),
        }
    )
    signature = generic.DictionaryObject(
        {generic.pdf_name('/Reference'): generic.ArrayObject([reference])}
    )
    dictionary = generic.DictionaryObject({generic.pdf_name('/V'): signature})
    return Field(name, None, dictionary, '/Sig', [dictionary])


@pytest.mark.parametrize(
    ('lock', 'locked'),
    [
        (FieldMDPSpec(FieldMDPAction.INCLUDE, ['a']), {'a'}),
        (FieldMDPSpec(FieldMDPAction.EXCLUDE, ['a']), {'b', 'sig'}),
        (FieldMDPSpec(FieldMDPAction.ALL), {'a', 'b', 'sig'}),
    ],
)
def test_a_lock_reads_as_its_action_says(lock, locked):
    fields = {
        'a': Field('a', None, generic.DictionaryObject(), '/Tx', []),
        'b': Field('b', None, generic.DictionaryObject(), '/Tx', []),
        'sig': signed_field('sig', lock),
    }
    assert locked_by_signatures(fields) == locked


def test_validate_trusts_a_chain_to_a_given_root_only():
    impostor = CertificateAuthority(organization='Altcineva').issue('Ana Ștefănescu')
    pdf = sign(fill_row(prepared_sheet(), 1), trainee, 'row1_trainee', 1, certify=True)
    pdf = sign(pdf, impostor, 'row1_trainer', 1)

    ours, theirs = validate(pdf, [authority.pem])
    assert ours['trusted'] and not theirs['trusted']
    assert ours['coverage'] == 'partial' and theirs['coverage'] == 'entire'
    assert theirs['signerName'] == ours['signerName']
    assert theirs['issuer'] == 'O=Altcineva,CN=SSM Ușor test CA' != ours['issuer']
    assert theirs['certificateSerial'] == serial_of(impostor) != ours['certificateSerial']
    assert theirs['subjectSerialNumber'] is None
    assert all(r['intact'] and r['modificationsPermitted'] for r in (ours, theirs))

    assert [r['trusted'] for r in validate(pdf)] == [False, False]


def test_begin_refuses_a_certificate_the_chain_did_not_issue():
    stranger = CertificateAuthority(organization='Altcineva')
    body = begin_body(fill_row(prepared_sheet(), 1), trainee, 'row1_trainee', row_fields(1))
    refused = post('/sign/begin', {**body, 'chainPem': [stranger.pem]}, 400)
    assert refused['error'] == 'bad_certificate'


def test_begin_refuses_a_certificate_without_digital_signature():
    sealer = authority.issue('Sigiliu', digital_signature=False)
    body = begin_body(fill_row(prepared_sheet(), 1), sealer, 'row1_trainee', row_fields(1))
    assert post('/sign/begin', body, 400)['error'] == 'bad_certificate'


def test_begin_refuses_to_lock_a_signature_field():
    lock = [*row_fields(1), 'row1_trainer']
    body = begin_body(fill_row(prepared_sheet(), 1), trainee, 'row1_trainee', lock, True)
    assert post('/sign/begin', body, 400) == {
        'error': 'bad_lock_fields',
        'detail': 'Signature fields cannot be locked: row1_trainer.',
    }


def test_two_signatures_begun_at_once_both_finish():
    pdf = fill_row(fill_row(prepared_sheet(), 1), 2)
    bodies = [
        begin_body(pdf, trainee, 'row1_trainee', row_fields(1), True),
        begin_body(pdf, trainer, 'row2_trainer', row_fields(2), True),
    ]
    with ThreadPoolExecutor(2) as pool:
        responses = list(pool.map(lambda body: client.post('/sign/begin', json=body), bodies))
    assert [response.status_code for response in responses] == [200, 200]
    for identity, response in zip((trainee, trainer), responses, strict=True):
        begun = response.json()
        signature = b64(identity.sign(unb64(begun['toSign'])))
        body = {
            'prepared': begun['prepared'],
            'sessionToken': begun['sessionToken'],
            'signature': signature,
        }
        [result] = validate(unb64(post('/sign/finish', body)['pdf']))
        assert result['intact']


def test_stamp_draws_the_text_on_every_page_and_leaves_the_signatures_valid():
    pdf = sign(fill_row(prepared_sheet(), 1), trainee, 'row1_trainee', 1, certify=True)
    stamped = unb64(post('/stamp', {'pdf': b64(pdf), 'text': 'Copie emisă la 18.10.2026'})['pdf'])

    assert stamped.startswith(pdf)
    reader = PdfFileReader(BytesIO(stamped))
    for index in range(int(reader.root['/Pages']['/Count'])):
        page, _ = reader.find_page_for_modification(index)
        xobjects = page.get_object()['/Resources']['/XObject']
        assert any(str(name).startswith('/Stamp') for name in xobjects)
    fields = form_fields(reader)
    assert fields['row1_theme'].dictionary['/V'] == 'Instruire periodică: șantier'
    assert '/V' in fields['row1_trainee'].dictionary
    [result] = validate(stamped)
    assert result['intact']

    assert post('/stamp', {'pdf': b64(pdf), 'text': ''}, 422)['error'] == 'malformed_request'


SHEET_SSM_FORM = Path(__file__).parent / 'fixtures' / 'sheet-ssm-form.pdf'
SSM_SIGNATURE_FIELDS = [
    f'{row}_sig_{slot}'
    for row in ['h1', 'h2', *(f'p{n}' for n in range(1, 18)), *(f's{n}' for n in range(1, 18))]
    for slot in ('trainee', 'trainer', 'verifier')
] + ['adm_sig']
H1_FIELDS = ['h1_date', 'h1_duration', 'h1_trainer', 'h1_trainer_job_title', 'h1_material']
P1_FIELDS = ['p1_date', 'p1_duration', 'p1_occupation', 'p1_material']


def signed_ssm_sheet() -> bytes:
    sheet_pdf = SHEET_SSM_FORM.read_bytes()
    body = {'pdf': b64(sheet_pdf), 'signatureFields': SSM_SIGNATURE_FIELDS}
    pdf = unb64(post('/prepare-sheet', body)['pdf'])
    pdf = fill(
        pdf,
        {
            'h1_date': '01.10.2026',
            'h1_duration': '8 ore',
            'h1_trainer': 'Ion Țurcanu',
            'h1_trainer_job_title': 'Inspector SSM',
            'h1_material': 'Instruire introductiv-generală: legislație, riscuri, prim ajutor',
        },
    )
    pdf = sign(pdf, trainee, 'h1_sig_trainee', certify=True, lock_fields=H1_FIELDS)
    pdf = fill(
        pdf,
        {
            'p1_date': '15.10.2026',
            'p1_duration': '2 ore',
            'p1_occupation': 'Sudor',
            'p1_material': 'Instruire periodică: lucrul la înălțime',
        },
    )
    return sign(pdf, trainee, 'p1_sig_trainee', lock_fields=P1_FIELDS)


def test_the_ssm_sheet_as_libreoffice_exports_it_collects_two_rows_of_signatures():
    pdf = signed_ssm_sheet()

    results = validate(pdf, [authority.pem])
    assert [r['field'] for r in results] == ['h1_sig_trainee', 'p1_sig_trainee']
    assert [r['certified'] for r in results] == [True, False]
    assert [r['coverage'] for r in results] == ['partial', 'entire']
    assert all(r['intact'] and r['modificationsPermitted'] for r in results), results
    assert all(r['trusted'] for r in results)
    assert post('/fill', {'pdf': b64(pdf), 'values': {'h1_date': 'x'}}, 409)['detail'] == 'h1_date'


def test_pyhanko_default_policy_still_refuses_the_valid_sheet():
    # When this fails, pyHanko has fixed its in-place appearance check and DIFF_POLICY can go.
    [first, _] = PdfFileReader(BytesIO(signed_ssm_sheet())).embedded_regular_signatures
    context = ValidationContext(trust_roots=[], allow_fetching=False, revocation_mode='soft-fail')
    status = asyncio.run(
        async_validate_pdf_signature(
            first, signer_validation_context=context, diff_policy=DEFAULT_DIFF_POLICY
        )
    )
    assert status.intact and not status.docmdp_ok
