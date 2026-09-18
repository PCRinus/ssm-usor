# Branding generated documents

Status: exploration, nothing built  
Date: 19 September 2026  
Audience: founders, product, engineering

Can the documents a provider generates carry a mark that they were made with SSM Ușor, can it
be switched per customer, and is that something to sell? Short answer: yes to all three, with
one limit that shapes the design. A Word file can be edited, so a mark in the `.docx` is a
default, not a lock. Only the PDF can enforce it.

## What was tried

One experiment, on the risk evaluation team decision. LibreOffice added a footer to the
template holding

```text
{{#branding}}Document generat cu SSM Ușor · ssmusor.ro{{/branding}}
```

in grey 7.5 pt, centred. The engine then rendered the same template twice, with
`branding: [{}]` and with `branding: []`, and both were converted to PDF. The branded PDF
contains the line on its page; the unbranded one contains nothing and its footer takes no
visible space. So **the engine already does conditional branding, with no new code**: it
fills headers and footers like the body, and a loop over an empty list removes what it wraps.

## The options

| Option                        | What it looks like                                                              | Effort                                                                        | Notes                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Footer line**               | "Document generat cu SSM Ușor · ssmusor.ro", small and grey, on every page      | Small: a footer in the house style of the import, one value in the merge data | Proven above. Discreet, which suits what these documents are                                                       |
| **Footer line with our logo** | The same, with a small mark beside it                                           | Small to medium: the logo is a fixed image placed in the template's footer    | A fixed image needs no image module; it sits inside the conditional block. Worth checking how each viewer draws it |
| **Diagonal watermark**        | "SSM Ușor" across the page, light grey                                          | Medium: a shape in the header, behind the text                                | I would not. See "What suits these documents"                                                                      |
| **The provider's own logo**   | The external service's logo in the header or footer of every document it issues | Medium: an image that differs per organization                                | The more valuable feature. See "What to sell"                                                                      |
| **PDF stamp**                 | Any of the above, drawn onto the PDF after conversion                           | Medium, and it belongs with the PDF step                                      | The only variant a user cannot remove                                                                              |

## The limit: a Word file can be edited

The `.docx` is the source of truth and the user edits it in the app, by design (ADR 005).
Whatever we put in its footer, a user can delete in the editor or in Word. That is fine for a
default that most people leave alone, and it is not a control.

The PDF is different. It is made by us when a revision is issued, stored with its hash, and
is what gets signed. A mark drawn onto the PDF at that point cannot be edited out of the
issued document. `pdf-lib` is plain JavaScript and can write a line of text or place an image
on every page of an existing PDF, so the stamp should not need the conversion container to do
anything new. That it runs within a Worker's limits on our largest documents is to be
verified when the PDF step is built.

So the two layers do different jobs:

- **In the `.docx`**: a footer the template carries, on or off by the merge data. What people
  see while drafting, and what a downloaded Word file shows.
- **On the PDF**: the enforced version, applied by the API when it stores the issued PDF,
  according to the organization's plan at that moment.

If branding is ever part of a price, enforce it on the PDF and treat the `.docx` footer as a
courtesy.

## What suits these documents

These are an employer's legal documents: decisions signed by an administrator, shown to a
labour inspector. Two consequences.

- **Keep it in the footer and keep it small.** A diagonal watermark reads as "draft" or
  "specimen" on a legal document, and an inspector or a client may take it that way. A
  one-line "generated with" in the footer is the form people already know from invoicing
  tools, which is my impression of the market and not something I checked.
- **It must never look like we are a party to the document.** The decision is the employer's,
  prepared by the external service. Our line says how the file was produced, nothing more, and
  sits apart from the signature block.

## What to sell

Two different things hide under "branding", and the second is worth more.

1. **Removing our mark.** Free and entry plans carry the footer line; a higher plan removes
   it. Easy to explain and cheap to build, but modest: a small provider will not pay much to
   remove one grey line, and the line on a free plan is advertising we would want anyway.
2. **Adding theirs.** The provider's logo and contact line on every document it issues to
   its clients. This is the "white label" the product scope already lists for a higher tier,
   and it is what a provider shows its own customers, so it sells itself in a demo. It also
   makes leaving harder, in a fair way: their documents look like theirs because of us.

A workable ladder: every plan gets clean documents with our footer line; the paid plan lets
the provider replace that line with its own logo and details; removing all marks is part of
the same plan. That keeps one switch in the data model instead of two.

For a per-organization logo the engine needs an image that changes. docxtemplater's image
module is a paid add-on. We do not need it for one fixed slot: the template carries a
placeholder image, and the engine swaps the bytes of that one file inside the `.docx` before
merging. It is the same zip the engine already opens. The logo upload, its size limits, and a
sensible fallback when a provider has none are the actual work.

## What it would take

Nothing here blocks the current work, and none of it should come before documents can be
generated at all.

1. **Footer line in the house style.** Add the conditional footer to the import's
   typesetting, and `branding` to the merge data as a list that is empty or has one item.
   About a day, mostly reading the result in Word, Pages, LibreOffice, and the in-app editor.
2. **The switch.** A column on `organizations` for what its documents carry: our line, the
   provider's own, or nothing. Until billing exists it is set by us.
3. **PDF stamp**, with the PDF step: `pdf-lib` in the API after conversion, reading the same
   switch.
4. **The provider's logo**: upload to Storage under the organization, the image swap in the
   engine, and the header or footer slot in the templates.

## Open questions

- Does the provider contact who will use the product first mind our line on the documents he
  gives his clients? His reaction is the cheapest market research available.
- Should the mark say "SSM Ușor" or carry the domain? The domain is what turns a document seen
  by a client's administrator into a lead.
- Does a labour inspector react to a vendor line in a footer? Worth one question to the same
  contact before it ships on by default.
