from io import BytesIO

from pyhanko.pdf_utils.misc import PdfError
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.diff_analysis import (
    DEFAULT_DIFF_POLICY,
    DiffResult,
    FormUpdatingRule,
    GenericFieldModificationRule,
    SigFieldCreationRule,
    SigFieldModificationRule,
    StandardDiffPolicy,
)
from pyhanko.sign.validation.pdf_embedded import EmbeddedPdfSignature, async_validate_pdf_signature
from pyhanko.sign.validation.status import SignatureCoverageLevel
from pyhanko_certvalidator import ValidationContext

from .certificates import common_name, issuer_name, load_certificate, serial_hex
from .errors import SignerError

# pyHanko's in-place appearance check (`get_last_change(ref) == old_rev` in its
# form_field_rules.py) flags every field whose appearance was written before the
# signed revision as changed after it, so a row filled before an earlier row's lock would read as
# a change to that lock. The service never rewrites an appearance in place; a real in-place change
# is still caught, as an unexplained one.
DIFF_POLICY = StandardDiffPolicy(
    global_rules=DEFAULT_DIFF_POLICY.global_rules,
    form_rule=FormUpdatingRule(
        field_rules=[
            SigFieldCreationRule(),
            SigFieldModificationRule(allow_in_place_appearance_stream_changes=False),
            GenericFieldModificationRule(allow_in_place_appearance_stream_changes=False),
        ],
    ),
)


def _certifies(signature: EmbeddedPdfSignature) -> bool:
    references = signature.sig_object.get('/Reference', [])
    return any(ref.get('/TransformMethod') == '/DocMDP' for ref in references)


async def validate(pdf: bytes, trust_roots_pem: list[str] | None = None) -> list[dict]:
    roots = [load_certificate(text) for text in trust_roots_pem or []]
    try:
        reader = PdfFileReader(BytesIO(pdf))
        signatures = reader.embedded_regular_signatures
    except (PdfError, ValueError, KeyError) as error:
        raise SignerError('not_a_pdf', f'The file could not be read as a PDF: {error}') from error

    results = []
    for signature in signatures:
        signed_at = signature.self_reported_timestamp
        # The chain is checked at the signing time the signature states, as Adobe Acrobat does by
        # default: without a timestamp (#486) a certificate that expired since would fail a
        # signature that was sound when made. No revocation: the app publishes no lists.
        context = ValidationContext(
            trust_roots=roots,
            allow_fetching=False,
            revocation_mode='soft-fail',
            moment=signed_at,
        )
        status = await async_validate_pdf_signature(
            signature, signer_validation_context=context, diff_policy=DIFF_POLICY
        )
        signed_at = status.signer_reported_dt or signed_at
        certificate = status.signing_cert
        results.append(
            {
                'field': signature.field_name,
                'signerName': common_name(certificate),
                'signedAt': signed_at.isoformat() if signed_at else None,
                'intact': bool(status.intact and status.valid),
                'modificationsPermitted': isinstance(status.diff_result, DiffResult)
                and status.docmdp_ok is True,
                'certified': _certifies(signature),
                'trusted': status.trust_problem_indic is None
                and status.validation_path is not None,
                'certificateSerial': serial_hex(certificate),
                'issuer': issuer_name(certificate),
                'subjectSerialNumber': certificate.subject.native.get('serial_number'),
                'coverage': 'entire'
                if status.coverage == SignatureCoverageLevel.ENTIRE_FILE
                else 'partial',
            }
        )
    return results
