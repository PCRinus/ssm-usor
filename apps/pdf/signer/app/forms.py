import re
from collections.abc import Iterable
from dataclasses import dataclass
from io import BytesIO

from pyhanko.pdf_utils import generic, layout
from pyhanko.pdf_utils.form_tools import TextFieldContent, annot_width_height
from pyhanko.pdf_utils.generic import pdf_name
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.misc import PdfError
from pyhanko.pdf_utils.rw_common import PdfHandler
from pyhanko.pdf_utils.text import TextBoxStyle
from pyhanko.sign.fields import FieldMDPSpec

from .errors import SignerError
from .fonts import SharedSubset

TEXT_FIELD_LAYOUT = layout.SimpleBoxLayoutRule(
    x_align=layout.AxisAlignment.ALIGN_MIN,
    y_align=layout.AxisAlignment.ALIGN_MID,
    margins=layout.Margins(left=2, right=2, top=1, bottom=1),
    inner_content_scaling=layout.InnerScaling.SHRINK_TO_FIT,
)
DEFAULT_FONT_SIZE = 9
TEXT_FIELD_KEYS = ('/V', '/DV', '/DA', '/Ff', '/MaxLen', '/Q', '/AA', '/RV', '/DS')


@dataclass
class Field:
    name: str
    ref: generic.Reference
    dictionary: generic.DictionaryObject
    field_type: str | None
    widgets: list[generic.DictionaryObject]


def open_writer(pdf: bytes) -> IncrementalPdfFileWriter:
    try:
        return IncrementalPdfFileWriter(BytesIO(pdf))
    except (PdfError, ValueError, KeyError) as error:
        raise SignerError('not_a_pdf', f'The file could not be read as a PDF: {error}') from error


def written(writer: IncrementalPdfFileWriter) -> bytes:
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def form_fields(handler: PdfHandler) -> dict[str, Field]:
    """The terminal fields of the form by fully qualified name; empty when there is no form."""
    try:
        roots = handler.root['/AcroForm']['/Fields']
    except KeyError:
        return {}
    fields: dict[str, Field] = {}
    _collect(roots, '', None, fields, set())
    return fields


def _collect(kids, parent_name, parent_type, fields, seen):
    for kid in kids:
        if not isinstance(kid, generic.IndirectObject) or kid.reference in seen:
            continue
        seen.add(kid.reference)
        node = kid.get_object()
        if '/T' not in node:
            continue
        name = f'{parent_name}.{node["/T"]}' if parent_name else str(node['/T'])
        field_type = node.get('/FT', parent_type)
        children = node.get('/Kids', [])
        named_children = [c for c in children if '/T' in c.get_object()]
        if named_children:
            _collect(named_children, name, field_type, fields, seen)
            continue
        widgets = [c.get_object() for c in children] if children else [node]
        fields[name] = Field(name, kid.reference, node, field_type, widgets)


def require_fields(fields: dict[str, Field], names: Iterable[str]) -> None:
    unknown = sorted(set(names) - fields.keys())
    if unknown:
        raise SignerError('unknown_fields', f'No such fields: {", ".join(unknown)}.')


def locked_by_signatures(fields: dict[str, Field]) -> set[str]:
    locks = [
        FieldMDPSpec.from_pdf_object(reference['/TransformParams'])
        for field in fields.values()
        if field.field_type == '/Sig' and '/V' in field.dictionary
        for reference in (
            item.get_object() for item in field.dictionary['/V'].get('/Reference', ())
        )
        if reference.get('/TransformMethod') == '/FieldMDP'
    ]
    return {name for name in fields if any(lock.is_locked(name) for lock in locks)}


def prepare_sheet(pdf: bytes, signature_fields: list[str]) -> bytes:
    writer = open_writer(pdf)
    _name_by_tooltip(writer, form_fields(writer))
    fields = form_fields(writer)
    require_fields(fields, signature_fields)
    for name in signature_fields:
        field = fields[name]
        if field.field_type == '/Sig':
            continue
        if field.field_type != '/Tx':
            raise SignerError('not_a_text_field', f'{name} is not a text field.')
        if len(field.widgets) != 1:
            raise SignerError('several_widgets', f'{name} appears more than once.')
        _turn_into_signature_field(writer, field)
    for name, field in fields.items():
        if field.field_type == '/Tx' and name not in signature_fields:
            _clear_placeholder(writer, field)
    _drop_need_appearances(writer)
    return written(writer)


def _clear_placeholder(writer: IncrementalPdfFileWriter, field: Field) -> None:
    # LibreOffice exports the blank placeholder as the value; a viewer or a flattening merge that
    # redraws the field from it prints a question mark for each space its font lacks.
    value = field.dictionary.get('/V')
    if value is None or str(value).strip():
        return
    for key in ('/V', '/DV'):
        field.dictionary.pop(key, None)
    writer.update_container(field.dictionary)


def _name_by_tooltip(writer: IncrementalPdfFileWriter, fields: dict[str, Field]) -> None:
    # LibreOffice exports a Word content control as a text field named Widget, _2, _3, … and
    # puts the control's title, which the template sets to the field's name, in the tooltip.
    titled = {name: field for name, field in fields.items() if '/TU' in field.dictionary}
    titles = [str(field.dictionary['/TU']) for field in titled.values()]
    duplicates = sorted({title for title in titles if titles.count(title) > 1})
    if duplicates:
        raise SignerError('duplicate_fields', f'Fields titled twice: {", ".join(duplicates)}.')
    taken = set(fields) - set(titled)
    clashes = sorted(taken.intersection(titles))
    if clashes:
        raise SignerError(
            'duplicate_fields', f'Fields named and titled alike: {", ".join(clashes)}.'
        )
    for field in titled.values():
        field.dictionary[pdf_name('/T')] = generic.TextStringObject(str(field.dictionary['/TU']))
        del field.dictionary['/TU']
        writer.update_container(field.dictionary)


def _turn_into_signature_field(writer: IncrementalPdfFileWriter, field: Field) -> None:
    widget = field.widgets[0]
    for key in TEXT_FIELD_KEYS:
        field.dictionary.pop(key, None)
        widget.pop(key, None)
    field.dictionary[pdf_name('/FT')] = pdf_name('/Sig')
    width, height = annot_width_height(widget)
    # PDF/A requires an appearance for every visible widget, an empty one included.
    empty = generic.StreamObject(
        {
            pdf_name('/Type'): pdf_name('/XObject'),
            pdf_name('/Subtype'): pdf_name('/Form'),
            pdf_name('/BBox'): generic.ArrayObject(
                [
                    generic.FloatObject(0),
                    generic.FloatObject(0),
                    generic.FloatObject(width),
                    generic.FloatObject(height),
                ]
            ),
        },
        stream_data=b'',
    )
    widget[pdf_name('/AP')] = generic.DictionaryObject({pdf_name('/N'): writer.add_object(empty)})
    writer.update_container(field.dictionary)
    if widget is not field.dictionary:
        writer.update_container(widget)


def _drop_need_appearances(writer: IncrementalPdfFileWriter) -> None:
    # A viewer that honours it redraws every field itself, which changes how signed fields look.
    form = writer.root['/AcroForm']
    if '/NeedAppearances' in form:
        del form['/NeedAppearances']
        writer.update_container(form)


def fill_fields(pdf: bytes, values: dict[str, str]) -> bytes:
    writer = open_writer(pdf)
    fields = form_fields(writer)
    require_fields(fields, values)
    not_text = sorted(name for name in values if fields[name].field_type != '/Tx')
    if not_text:
        raise SignerError('not_a_text_field', f'Not text fields: {", ".join(not_text)}.')
    locked = sorted(locked_by_signatures(fields).intersection(values))
    if locked:
        raise SignerError('locked_field', ', '.join(locked), 409)
    font = SharedSubset(writer)
    engine = font.create_font_engine(writer)
    for name, value in values.items():
        field = fields[name]
        field.dictionary[pdf_name('/V')] = generic.TextStringObject(value)
        writer.update_container(field.dictionary)
        for widget in field.widgets:
            width, height = annot_width_height(widget)
            style = TextBoxStyle(
                font=font,
                font_size=_fitting_size(engine, value, width, height, _font_size(field, widget)),
                box_layout_rule=TEXT_FIELD_LAYOUT,
            )
            content = TextFieldContent(
                writer=writer,
                text_content=value,
                text_style=style,
                box=layout.BoxConstraints(width=width, height=height),
            )
            content.apply_appearance(widget)
            writer.update_container(widget)
    return written(writer)


def _fitting_size(engine, value: str, width: float, height: float, size: float) -> int:
    # pyHanko's shrink-to-fit places the first line by the shrunk height twice, which pushes the
    # last lines of a shrunk text below the field, where they are cut off. A size at which the text
    # fits as it is never shrinks. Whole points, since pyHanko writes the size with %d.
    lines = value.split('\n')
    widest = max((engine.shape(line).x_advance for line in lines), default=0)
    margins = TEXT_FIELD_LAYOUT.margins
    room = [(float(height) - margins.top - margins.bottom) / len(lines)]
    if widest > 0:
        room.append((float(width) - margins.left - margins.right) / widest)
    return max(1, int(min(size, *room)))


def _font_size(field: Field, widget: generic.DictionaryObject) -> float:
    appearance = widget.get('/DA', field.dictionary.get('/DA', ''))
    match = re.search(r'([\d.]+)\s+Tf', str(appearance))
    size = float(match.group(1)) if match else 0
    # 0 is "auto" in a /DA string.
    return size if size > 0 else DEFAULT_FONT_SIZE
