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
from pyhanko_certvalidator import ValidationContext

from .errors import SignerError

# pyHanko's in-place appearance check flags every field whose appearance was written before the
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


async def validate(pdf: bytes) -> list[dict]:
    try:
        reader = PdfFileReader(BytesIO(pdf))
        signatures = reader.embedded_regular_signatures
    except (PdfError, ValueError, KeyError) as error:
        raise SignerError('not_a_pdf', f'The file could not be read as a PDF: {error}') from error

    results = []
    for signature in signatures:
        # Trusts nothing: the app is its own certificate authority, so a chain to a public root
        # would never be found, and what matters here is integrity and what changed after.
        context = ValidationContext(
            trust_roots=[], allow_fetching=False, revocation_mode='soft-fail'
        )
        status = await async_validate_pdf_signature(
            signature, signer_validation_context=context, diff_policy=DIFF_POLICY
        )
        signed_at = status.signer_reported_dt or signature.self_reported_timestamp
        certificate = status.signing_cert
        results.append(
            {
                'field': signature.field_name,
                'signerName': certificate.subject.native.get('common_name')
                or certificate.subject.human_friendly,
                'signedAt': signed_at.isoformat() if signed_at else None,
                'intact': bool(status.intact and status.valid),
                'modificationsPermitted': isinstance(status.diff_result, DiffResult)
                and status.docmdp_ok is True,
                'certified': _certifies(signature),
            }
        )
    return results
