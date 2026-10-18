from pyhanko.pdf_utils import generic, layout
from pyhanko.pdf_utils.text import TextBoxStyle
from pyhanko.stamp import TextStamp, TextStampStyle

from .fonts import SharedSubset
from .forms import open_writer, written

FONT_SIZE = 7
GREY = (0.45, 0.45, 0.45)
SIDE_MARGIN = 28
BOX_HEIGHT = 12
FROM_TOP = 20
LAYOUT = layout.SimpleBoxLayoutRule(
    x_align=layout.AxisAlignment.ALIGN_MIN,
    y_align=layout.AxisAlignment.ALIGN_MID,
    margins=layout.Margins.uniform(0),
    inner_content_scaling=layout.InnerScaling.SHRINK_TO_FIT,
)


def _inherited(page: generic.DictionaryObject, key: str):
    node = page
    while key not in node:
        node = node['/Parent']
    return node[key]


def stamp_pages(pdf: bytes, text: str) -> bytes:
    writer = open_writer(pdf)
    style = TextStampStyle(
        stamp_text='%(text)s',
        text_box_style=TextBoxStyle(
            font=SharedSubset(writer),
            font_size=FONT_SIZE,
            text_color=GREY,
            box_layout_rule=LAYOUT,
        ),
        border_width=0,
        inner_content_layout=LAYOUT,
    )
    for index in range(int(writer.root['/Pages']['/Count'])):
        page_ref, _ = writer.find_page_for_modification(index)
        left, _, right, top = (
            float(value) for value in _inherited(page_ref.get_object(), '/MediaBox')
        )
        box = layout.BoxConstraints(width=right - left - 2 * SIDE_MARGIN, height=BOX_HEIGHT)
        TextStamp(writer, style, text_params={'text': text}, box=box).apply(
            index, left + SIDE_MARGIN, top - FROM_TOP
        )
    return written(writer)
