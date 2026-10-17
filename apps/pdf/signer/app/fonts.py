import os
import sys
from functools import cache

from fontTools.ttLib import TTFont
from fontTools.ttLib.scaleUpem import scale_upem
from pyhanko.pdf_utils.font.api import FontEngine, FontEngineFactory
from pyhanko.pdf_utils.font.opentype import GlyphAccumulatorFactory
from pyhanko.pdf_utils.writer import BasePdfFileWriter

DEFAULT_FONT = '/app/fonts/LiberationSans-Regular.ttf'
# pyHanko writes a subset's glyph widths in the font's own units, which PDF reads as thousandths
# of an em: a font with another grid (Liberation Sans has 2048) draws its text spread out.
UNITS_PER_EM = 1000


def rescale(source: str, target: str) -> None:
    font = TTFont(source)
    scale_upem(font, UNITS_PER_EM)
    font.save(target)


@cache
def font_file() -> str:
    # Embedded, because the standard 14 fonts have no ș or ț, and PDF/A wants every font embedded.
    path = os.environ.get('SIGNER_FONT', DEFAULT_FONT)
    if not os.path.isfile(path):
        raise RuntimeError(f'SIGNER_FONT is not a font file: {path}')
    if TTFont(path, lazy=True)['head'].unitsPerEm != UNITS_PER_EM:
        raise RuntimeError(
            f'{path} is not on a {UNITS_PER_EM}-unit grid; run python -m app.fonts on it.'
        )
    return path


class SharedSubset(FontEngineFactory):
    """Every text written in one update shares one embedded subset, instead of a font per field."""

    def __init__(self, writer: BasePdfFileWriter):
        self._engine = GlyphAccumulatorFactory(font_file()).create_font_engine(writer)

    def create_font_engine(self, writer: BasePdfFileWriter, obj_stream=None) -> FontEngine:
        return self._engine


if __name__ == '__main__':
    rescale(sys.argv[1], sys.argv[2])
