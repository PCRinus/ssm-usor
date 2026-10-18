from asn1crypto import pem, x509
from cryptography import x509 as crypto_x509
from cryptography.exceptions import InvalidSignature

from .errors import SignerError


def load_certificate(text: str) -> x509.Certificate:
    try:
        data = text.encode('ascii')
        if pem.detect(data):
            _, _, data = pem.unarmor(data)
        certificate = x509.Certificate.load(data)
        # asn1crypto parses lazily: reading it all here turns a broken certificate into a refusal.
        _ = certificate.native
    except Exception as error:
        raise SignerError('bad_certificate', 'A certificate could not be read.') from error
    return certificate


def require_issued_by_chain(certificate: x509.Certificate, chain: list[x509.Certificate]) -> None:
    subject = crypto_x509.load_der_x509_certificate(certificate.dump())
    for candidate in chain:
        try:
            subject.verify_directly_issued_by(
                crypto_x509.load_der_x509_certificate(candidate.dump())
            )
            return
        except (ValueError, TypeError, InvalidSignature):
            continue
    raise SignerError('bad_certificate', 'No certificate of the chain issued the certificate.')


def require_digital_signature(certificate: x509.Certificate) -> None:
    usage = certificate.key_usage_value
    if usage is None or 'digital_signature' not in usage.native:
        raise SignerError('bad_certificate', 'The certificate is not for digital signatures.')


def serial_hex(certificate: x509.Certificate) -> str:
    # As @peculiar/x509 gives it in the API: lowercase, an even number of digits, no sign byte.
    digits = format(certificate.serial_number, 'x')
    return digits.zfill(len(digits) + len(digits) % 2)


def issuer_name(certificate: x509.Certificate) -> str:
    return crypto_x509.load_der_x509_certificate(certificate.dump()).issuer.rfc4514_string()


def common_name(certificate: x509.Certificate) -> str:
    return certificate.subject.native.get('common_name') or certificate.subject.human_friendly
