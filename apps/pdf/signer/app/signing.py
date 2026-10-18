import hashlib
import secrets
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO

from asn1crypto import algos, cms, x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pyhanko.pdf_utils import layout
from pyhanko.pdf_utils.text import TextBoxStyle
from pyhanko.sign.fields import FieldMDPAction, FieldMDPSpec, MDPPerm, SigSeedSubFilter
from pyhanko.sign.signers.cms_embedder import (
    PdfCMSEmbedder,
    SigAppearanceSetup,
    SigIOSetup,
    SigMDPSetup,
    SigObjSetup,
)
from pyhanko.sign.signers.pdf_byterange import PreparedByteRangeDigest, SignatureObject
from pyhanko.sign.signers.pdf_cms import ExternalSigner
from pyhanko.sign.validation.pdf_embedded import read_certification_data
from pyhanko.stamp import TextStampStyle
from pyhanko_certvalidator.registry import SimpleCertificateStore

from .certificates import (
    common_name,
    load_certificate,
    require_digital_signature,
    require_issued_by_chain,
)
from .errors import SignerError
from .fonts import SharedSubset
from .forms import form_fields, open_writer, require_fields

SESSION_SECONDS = 600
DIGEST = 'sha256'
MECHANISM = algos.SignedDigestAlgorithm({'algorithm': 'sha256_ecdsa'})
# An ECDSA P-256 signature in DER is at most 72 bytes; the placeholder only has to be as long.
PLACEHOLDER_SIGNATURE = bytes(72)
APPEARANCE_LAYOUT = layout.SimpleBoxLayoutRule(
    x_align=layout.AxisAlignment.ALIGN_MIN,
    y_align=layout.AxisAlignment.ALIGN_MID,
    margins=layout.Margins.uniform(2),
    inner_content_scaling=layout.InnerScaling.SHRINK_TO_FIT,
)
APPEARANCE_FONT_SIZE = 7


@dataclass
class BeginOptions:
    field: str
    certificate_pem: str
    chain_pem: list[str]
    reason: str
    signed_at: str
    certify: bool
    lock_fields: list[str]
    appearance_lines: list[str]


@dataclass
class Session:
    digest: PreparedByteRangeDigest
    signed_attrs: bytes
    certificate: x509.Certificate
    chain: list[x509.Certificate]
    expires_at: float = field(default_factory=lambda: time.monotonic() + SESSION_SECONDS)


# In memory on purpose: one instance runs, and a session outlives neither a restart nor ten minutes.
sessions: dict[str, Session] = {}
# The handlers run in Starlette's threadpool.
sessions_lock = threading.Lock()


def _forget_expired() -> None:
    now = time.monotonic()
    for token in [token for token, session in sessions.items() if session.expires_at <= now]:
        del sessions[token]


def _session(token: str) -> Session:
    with sessions_lock:
        _forget_expired()
        session = sessions.get(token)
    if session is None:
        raise SignerError('unknown_session', 'The signing session is unknown or expired.', 404)
    return session


def _signed_at(text: str) -> datetime:
    try:
        moment = datetime.fromisoformat(text)
    except ValueError as error:
        raise SignerError('bad_signed_at', 'signedAt is not an ISO 8601 date and time.') from error
    if moment.tzinfo is None:
        raise SignerError('bad_signed_at', 'signedAt has no time zone.')
    return moment


async def begin_signature(pdf: bytes, options: BeginOptions) -> tuple[bytes, bytes, str]:
    certificate = load_certificate(options.certificate_pem)
    chain = [load_certificate(text) for text in options.chain_pem]
    key = certificate.public_key
    if key.algorithm != 'ec' or key.curve != ('named', 'secp256r1'):
        raise SignerError('bad_certificate', 'The certificate is not for an ECDSA P-256 key.')
    require_digital_signature(certificate)
    require_issued_by_chain(certificate, chain)
    signed_at = _signed_at(options.signed_at)

    writer = open_writer(pdf)
    fields = form_fields(writer)
    require_fields(fields, [options.field, *options.lock_fields])
    target = fields[options.field]
    if target.field_type != '/Sig':
        raise SignerError('not_a_signature_field', f'{options.field} is not a signature field.')
    if '/V' in target.dictionary:
        raise SignerError('already_signed', f'{options.field} is signed already.')
    # A locked signature field could never be signed: the lock forbids the signature itself.
    signature_locks = sorted(
        name for name in options.lock_fields if fields[name].field_type == '/Sig'
    )
    if signature_locks:
        raise SignerError(
            'bad_lock_fields', f'Signature fields cannot be locked: {", ".join(signature_locks)}.'
        )
    already_signed = any(f.field_type == '/Sig' and '/V' in f.dictionary for f in fields.values())
    if options.certify and already_signed:
        raise SignerError('cannot_certify', 'Only the first signature can certify a document.')
    certification = read_certification_data(writer.prev)
    if certification is not None and certification.permission == MDPPerm.NO_CHANGES:
        raise SignerError('locked_document', 'The document is certified against any change.')

    signer = ExternalSigner(
        signing_cert=certificate,
        cert_registry=SimpleCertificateStore.from_certs(chain),
        signature_value=PLACEHOLDER_SIGNATURE,
        signature_mechanism=MECHANISM,
    )
    estimate = await signer.async_sign(bytes(32), DIGEST, dry_run=True, use_pades=True)
    bytes_reserved = 2 * len(estimate.dump()) + 512

    embedder = PdfCMSEmbedder().write_cms(
        field_name=options.field, writer=writer, existing_fields_only=True
    )
    next(embedder)
    # The lock goes into the signature's /FieldMDP reference, which is what validators read. Writing
    # /Lock into the field instead would be a change the certification does not permit.
    field_lock = (
        FieldMDPSpec(action=FieldMDPAction.INCLUDE, fields=options.lock_fields)
        if options.lock_fields
        else None
    )
    embedder.send(
        SigObjSetup(
            sig_placeholder=SignatureObject(
                timestamp=signed_at,
                subfilter=SigSeedSubFilter.PADES,
                name=common_name(certificate),
                reason=options.reason or None,
                bytes_reserved=bytes_reserved,
            ),
            mdp_setup=SigMDPSetup(
                md_algorithm=DIGEST,
                certify=options.certify,
                field_lock=field_lock,
                docmdp_perms=MDPPerm.FILL_FORMS if options.certify else None,
            ),
            appearance_setup=SigAppearanceSetup(
                style=TextStampStyle(
                    stamp_text='%(lines)s',
                    text_box_style=TextBoxStyle(
                        font=SharedSubset(writer), font_size=APPEARANCE_FONT_SIZE
                    ),
                    border_width=0,
                    inner_content_layout=APPEARANCE_LAYOUT,
                ),
                timestamp=signed_at,
                name=None,
                text_params={'lines': '\n'.join(options.appearance_lines)},
            ),
        )
    )
    digest, output = embedder.send(SigIOSetup(md_algorithm=DIGEST))
    signed_attrs = await signer.signed_attrs(digest.document_digest, DIGEST, use_pades=True)

    token = secrets.token_urlsafe(32)
    with sessions_lock:
        _forget_expired()
        sessions[token] = Session(digest, signed_attrs.dump(), certificate, chain)
    return output.getvalue(), signed_attrs.dump(), token


async def finish_signature(prepared: bytes, token: str, signature: bytes) -> bytes:
    session = _session(token)
    if len(signature) != 64:
        raise SignerError('bad_signature', 'The signature is not 64 bytes of r||s.')
    der = algos.DSASignature(
        {
            'r': int.from_bytes(signature[:32], 'big'),
            's': int.from_bytes(signature[32:], 'big'),
        }
    ).dump()
    public_key = serialization.load_der_public_key(session.certificate.public_key.dump())
    try:
        public_key.verify(der, session.signed_attrs, ec.ECDSA(hashes.SHA256()))
    except InvalidSignature as error:
        raise SignerError(
            'bad_signature', 'The signature does not verify against the certificate.'
        ) from error

    digest = session.digest
    covered = hashlib.sha256()
    covered.update(prepared[: digest.reserved_region_start])
    covered.update(prepared[digest.reserved_region_end :])
    if covered.digest() != digest.document_digest:
        raise SignerError('prepared_changed', 'The prepared PDF is not the one this session made.')

    signer = ExternalSigner(
        signing_cert=session.certificate,
        cert_registry=SimpleCertificateStore.from_certs(session.chain),
        signature_value=der,
        signature_mechanism=MECHANISM,
    )
    signed_data = await signer.async_sign_prescribed_attributes(
        DIGEST, cms.CMSAttributes.load(session.signed_attrs)
    )
    # Taken only now, so that a wrong signature leaves the session for another try, and under the
    # lock, so that of two finishes racing on one session only one returns a signed PDF.
    with sessions_lock:
        if sessions.pop(token, None) is None:
            raise SignerError('unknown_session', 'The signing session is unknown or expired.', 404)
    output = BytesIO(prepared)
    digest.fill_with_cms(output, signed_data)
    return output.getvalue()
