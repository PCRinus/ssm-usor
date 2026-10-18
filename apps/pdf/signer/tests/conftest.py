import os
import tempfile
from glob import glob
from pathlib import Path

import pytest

from app.fonts import rescale

REPO = Path(__file__).resolve().parents[4]
SOURCES = [
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    *glob(
        str(
            REPO
            / 'node_modules/.pnpm/@docx-editor.dev+fonts@*/node_modules/@docx-editor.dev/fonts/assets/LiberationSans-Regular.ttf'
        )
    ),
]


def pytest_configure(config):
    if os.environ.get('SIGNER_FONT'):
        return
    source = next((path for path in SOURCES if os.path.isfile(path)), None)
    if source is None:
        pytest.exit(
            'No Liberation Sans found: set SIGNER_FONT, or run pnpm install at the root.', 2
        )
    target = os.path.join(tempfile.mkdtemp(), 'LiberationSans-Regular.ttf')
    rescale(source, target)
    os.environ['SIGNER_FONT'] = target
