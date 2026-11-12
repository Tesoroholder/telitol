import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync, deflateSync } from "node:zlib";
import { extractText, MAX_DOC_CHARS, readZip } from "./doc-text.ts";

const enc = (s: string) => new TextEncoder().encode(s);

/** A minimal ZIP (some entries stored, some deflated), like an Office file. */
function zip(files: Record<string, string>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  let i = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.from(content, "utf8");
    const deflate = i++ % 2 === 1;
    const data = deflate ? deflateRawSync(raw) : raw;
    const nameBytes = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dir, end]));
}

/** A PDF from object bodies, with a correct-enough xref. */
function pdf(objects: (string | Buffer)[]): Uint8Array {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  let size = parts[0].length;
  objects.forEach((body, index) => {
    const chunk = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      typeof body === "string" ? Buffer.from(body, "latin1") : body,
      Buffer.from("\nendobj\n"),
    ]);
    parts.push(chunk);
    size += chunk.length;
  });
  parts.push(Buffer.from(`trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${size}\n%%EOF\n`));
  return new Uint8Array(Buffer.concat(parts));
}

const stream = (dict: string, data: Buffer) =>
  Buffer.concat([
    Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`),
    data,
    Buffer.from("\nendstream"),
  ]);

test("Word documents: paragraphs, in order", async () => {
  const docx = zip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml":
      '<w:document><w:body><w:p><w:r><w:t>Dear Ama,</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">Thank you for </w:t></w:r><w:r><w:t>the advice &amp; the notes.</w:t></w:r></w:p>' +
      "</w:body></w:document>",
  });
  assert.equal(await extractText("docx", docx), "Dear Ama,\nThank you for the advice & the notes.");
});

test("Excel workbooks: shared and inline strings, sheet by sheet", async () => {
  const xlsx = zip({
    "[Content_Types].xml": "<Types/>",
    "xl/sharedStrings.xml": "<sst><si><t>Month</t></si><si><t>Rainfall</t></si><si><r><t>Ja</t></r><r><t>n</t></r></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row>' +
      '<row><c t="s"><v>2</v></c><c><v>112.5</v></c></row>' +
      '<row><c t="inlineStr"><is><t>Feb</t></is></c><c><v>80</v></c></row></sheetData></worksheet>',
  });
  const out = await extractText("xlsx", xlsx);
  assert.match(out, /Sheet 1/);
  assert.match(out, /Month\s+Rainfall/);
  assert.match(out, /Jan\s+112\.5/);
  assert.match(out, /Feb\s+80/);
});

test("PowerPoint decks: slide by slide, in number order", async () => {
  const pptx = zip({
    "[Content_Types].xml": "<Types/>",
    "ppt/slides/slide10.xml": "<p:sld><a:p><a:r><a:t>Last slide</a:t></a:r></a:p></p:sld>",
    "ppt/slides/slide2.xml": "<p:sld><a:p><a:r><a:t>Methods</a:t></a:r></a:p></p:sld>",
    "ppt/slides/slide1.xml": "<p:sld><a:p><a:r><a:t>Aerosols over Ghana</a:t></a:r></a:p></p:sld>",
  });
  const out = await extractText("pptx", pptx);
  const first = out.indexOf("Aerosols over Ghana");
  const second = out.indexOf("Methods");
  const tenth = out.indexOf("Last slide");
  assert.ok(first >= 0 && first < second && second < tenth, out);
  assert.match(out, /Slide 1:/);
});

test("text and CSV files come through as they are, trimmed to the limit", async () => {
  assert.equal(await extractText("txt", enc("Line one\r\nLine two\n")), "Line one\nLine two");
  assert.match(await extractText("csv", enc("town,rain\nAccra,80\n")), /Accra,80/);
  const long = await extractText("txt", enc("word ".repeat(10_000)));
  assert.ok(long.length <= MAX_DOC_CHARS + 100);
});

test("broken or hostile ZIPs give no text instead of crashing", async () => {
  assert.equal(await extractText("docx", enc("PK\u0003\u0004 not really a zip")), "");
  // A tiny file that would inflate to a huge one is refused.
  const bomb = zip({ "[Content_Types].xml": "<Types/>", "word/document.xml": "a".repeat(60 * 1024 * 1024) });
  assert.ok(bomb.length < 200_000);
  assert.equal(await extractText("docx", bomb), "");
  assert.equal(readZip(enc("nothing here")).size, 0);
});

test("PDFs: plain and compressed text streams", async () => {
  const content = "BT /F1 12 Tf 72 720 Td (Fine particulate matter \\(PM2.5\\)) Tj T* (is a health risk.) Tj ET";
  const plain = pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    stream("", Buffer.from(content, "latin1")),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]);
  const out = await extractText("pdf", plain);
  assert.match(out, /Fine particulate matter \(PM2\.5\)/);
  assert.match(out, /is a health risk\./);

  const flate = pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    stream("/Filter /FlateDecode", deflateSync(Buffer.from(content, "latin1"))),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]);
  assert.match(await extractText("pdf", flate), /Fine particulate matter/);
});

test("PDFs: fonts with their own character codes are mapped back to letters", async () => {
  // Word and LibreOffice write glyph numbers; ToUnicode maps them to letters.
  const cmap = [
    "/CIDInit /ProcSet findresource begin 12 dict begin begincmap",
    "1 begincodespacerange <0000> <FFFF> endcodespacerange",
    "2 beginbfchar <0001> <0048> <0002> <0069> endbfchar",
    "1 beginbfrange <0003> <0005> <0061> endbfrange",
    "endcmap end end",
  ].join("\n");
  const content =
    "BT /F1 11 Tf 72 700 Td <00010002> Tj ( ) Tj [<0003>-50<0004>-400<0005>] TJ " +
    "T* [<0005><0003><0004>-400<0003><0004><0005>-400<0004><0005><0003>] TJ ET";
  const doc = pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    stream("/Filter /FlateDecode", deflateSync(Buffer.from(content, "latin1"))),
    "<< /Type /Font /Subtype /Type0 /BaseFont /ABCDEF+Calibri /Encoding /Identity-H /ToUnicode 6 0 R >>",
    stream("/Filter /FlateDecode", deflateSync(Buffer.from(cmap, "latin1"))),
  ]);
  const out = await extractText("pdf", doc);
  assert.match(out, /Hi/);
  // Small kerning keeps letters together; a big gap is a space.
  assert.match(out, /ab c/);
  assert.match(out, /cab abc bca/);
});

test("PDFs with no readable text (scans) give nothing back", async () => {
  const scan = pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>",
    stream("", Buffer.from("q 600 0 0 800 0 0 cm /Im1 Do Q", "latin1")),
  ]);
  assert.equal((await extractText("pdf", scan)).trim(), "");
  assert.equal(await extractText("pdf", enc("%PDF-1.4 garbage")), "");
});
