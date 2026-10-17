from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from io import BytesIO

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.x509.oid import NameOID
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

ROWS = 2
COLUMNS = ('date', 'theme', 'trainee', 'trainer')
SIGNATURE_COLUMNS = ('trainee', 'trainer')


def row_fields(row: int) -> list[str]:
    return [f'row{row}_{column}' for column in COLUMNS if column not in SIGNATURE_COLUMNS]


def signature_fields() -> list[str]:
    return [f'row{row}_{column}' for row in range(1, ROWS + 1) for column in SIGNATURE_COLUMNS]


def sheet() -> bytes:
    """A training sheet as LibreOffice exports one: every cell a text field, signature cells included."""
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    pdf.drawString(40, 800, 'Fișa individuală de instruire')
    for row in range(1, ROWS + 1):
        y = 760 - row * 40
        for index, column in enumerate(COLUMNS):
            pdf.acroForm.textfield(
                name=f'row{row}_{column}',
                x=40 + index * 130,
                y=y,
                width=120,
                height=30,
                borderWidth=0,
                fontName='Helvetica',
                fontSize=9,
            )
    pdf.save()
    return output.getvalue()


@dataclass
class Identity:
    name: str
    key: ec.EllipticCurvePrivateKey
    certificate_pem: str
    chain_pem: list[str]

    def sign(self, data: bytes) -> bytes:
        """What WebCrypto gives for ECDSA P-256 with SHA-256: r||s, 32 bytes each."""
        r, s = decode_dss_signature(self.key.sign(data, ec.ECDSA(hashes.SHA256())))
        return r.to_bytes(32, 'big') + s.to_bytes(32, 'big')


def _name(common_name: str) -> x509.Name:
    return x509.Name(
        [
            x509.NameAttribute(NameOID.COMMON_NAME, common_name),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, 'SSM Ușor test'),
        ]
    )


def _pem(certificate: x509.Certificate) -> str:
    return certificate.public_bytes(serialization.Encoding.PEM).decode('ascii')


class CertificateAuthority:
    def __init__(self):
        self.key = ec.generate_private_key(ec.SECP256R1())
        now = datetime.now(UTC)
        self.certificate = (
            x509.CertificateBuilder()
            .subject_name(_name('SSM Ușor test CA'))
            .issuer_name(_name('SSM Ușor test CA'))
            .public_key(self.key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=3650))
            .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
            .add_extension(
                x509.KeyUsage(
                    digital_signature=False,
                    content_commitment=False,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=True,
                    crl_sign=True,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .sign(self.key, hashes.SHA256())
        )

    def issue(self, common_name: str) -> Identity:
        key = ec.generate_private_key(ec.SECP256R1())
        now = datetime.now(UTC)
        certificate = (
            x509.CertificateBuilder()
            .subject_name(_name(common_name))
            .issuer_name(self.certificate.subject)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=730))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(
                x509.KeyUsage(
                    digital_signature=True,
                    content_commitment=True,
                    key_encipherment=False,
                    data_encipherment=False,
                    key_agreement=False,
                    key_cert_sign=False,
                    crl_sign=False,
                    encipher_only=False,
                    decipher_only=False,
                ),
                critical=True,
            )
            .sign(self.key, hashes.SHA256())
        )
        return Identity(common_name, key, _pem(certificate), [_pem(self.certificate)])
