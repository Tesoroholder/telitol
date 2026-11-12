import { inflateRawSync, inflateSync } from "node:zlib";

/**
 * Read the text out of a document so TeliTol AI can answer questions about
 * it. Supports .txt/.csv, Word (.docx), Excel (.xlsx), PowerPoint (.pptx) and
 * PDF. Office files are ZIP archives of XML; PDFs are read best-effort (text
 * PDFs work, scanned images of pages don't). No dependencies beyond Node.
 */

/** Most characters handed to the AI from one document. */
export const MAX_DOC_CHARS = 15_000;

/** Never inflate more than this from one archive (stops "zip bombs"). */
const MAX_UNZIPPED_BYTES = 40 * 1024 * 1024;

export async function extractText(extension: string, bytes: Uint8Array): Promise<string> {
  let text = "";
  switch (extension) {
    case "txt":
    case "csv":
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      break;
    case "docx":
      text = docxText(readZip(bytes));
      break;
    case "xlsx":
      text = xlsxText(readZip(bytes));
      break;
    case "pptx":
      text = pptxText(readZip(bytes));
      break;
    case "pdf":
      text = pdfText(bytes);
      break;
    default:
      text = "";
  }
  return tidy(text).slice(0, MAX_DOC_CHARS);
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- ZIP ----------

type ZipEntries = Map<string, () => Uint8Array>;

/** Read a ZIP's central directory; entries inflate lazily when asked for. */
export function readZip(bytes: Uint8Array): ZipEntries {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries: ZipEntries = new Map();
  // End of central directory: last 22..(22+65535) bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return entries;
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  let budget = MAX_UNZIPPED_BYTES;
  const decoder = new TextDecoder();
  for (let n = 0; n < count && offset + 46 <= bytes.length; n += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    entries.set(name, () => {
      if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50)
        return new Uint8Array();
      const start =
        localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const data = bytes.subarray(start, start + compressedSize);
      if (uncompressedSize > budget) return new Uint8Array();
      budget -= uncompressedSize;
      if (method === 0) return data;
      if (method === 8) {
        try {
          return new Uint8Array(inflateRawSync(data, { maxOutputLength: Math.max(1, uncompressedSize) }));
        } catch {
          return new Uint8Array();
        }
      }
      return new Uint8Array();
    });
  }
  return entries;
}

function entryText(entries: ZipEntries, name: string): string {
  const read = entries.get(name);
  return read ? new TextDecoder("utf-8", { fatal: false }).decode(read()) : "";
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => safeChar(Number.parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function safeChar(code: number): string {
  return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
}

const stripTags = (xml: string) => decodeEntities(xml.replace(/<[^>]+>/g, ""));

// ---------- Office ----------

export function docxText(entries: ZipEntries): string {
  const xml = entryText(entries, "word/document.xml");
  return stripTags(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:(br|cr)\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n"),
  );
}

const byNumber = (prefix: string) => (a: string, b: string) =>
  Number(a.slice(prefix.length).replace(/\D/g, "")) - Number(b.slice(prefix.length).replace(/\D/g, ""));

export function pptxText(entries: ZipEntries): string {
  const prefix = "ppt/slides/slide";
  const slides = [...entries.keys()]
    .filter((name) => name.startsWith(prefix) && name.endsWith(".xml"))
    .sort(byNumber(prefix));
  return slides
    .map((name, index) => {
      const xml = entryText(entries, name);
      const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>|<\/a:p>/g)]
        .map((m) => (m[1] === undefined ? "\n" : decodeEntities(m[1])))
        .join("");
      return `Slide ${index + 1}:\n${runs}`;
    })
    .join("\n\n");
}

export function xlsxText(entries: ZipEntries): string {
  const shared = [...entryText(entries, "xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeEntities(t[1])).join(""),
  );
  const prefix = "xl/worksheets/sheet";
  const sheets = [...entries.keys()]
    .filter((name) => name.startsWith(prefix) && name.endsWith(".xml"))
    .sort(byNumber(prefix));
  return sheets
    .map((name, index) => {
      const xml = entryText(entries, name);
      const rows = [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) =>
        [...row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
          .map((cell) => {
            const attrs = cell[1] ?? "";
            const inner = cell[2] ?? "";
            const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
            if (/t="s"/.test(attrs)) return shared[Number(value)] ?? "";
            if (/t="inlineStr"/.test(attrs))
              return [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeEntities(t[1])).join("");
            return decodeEntities(value);
          })
          .join("\t"),
      );
      return `Sheet ${index + 1}:\n${rows.join("\n")}`;
    })
    .join("\n\n");
}

// ---------- PDF (best effort) ----------

const latin1 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return s;
};

type PdfObject = { dict: string; stream: Uint8Array | null };
type CMap = { width: number; map: Map<number, string> };

/**
 * Text from a PDF. Reads every object, decodes compressed streams, maps font
 * glyph codes back to letters with each font's ToUnicode table (how Word and
 * LibreOffice PDFs store text), then reads the text-showing operators.
 * Scanned PDFs (pictures of pages) have no text to find.
 */
export function pdfText(bytes: Uint8Array): string {
  const raw = latin1(bytes);
  const objects = readPdfObjects(bytes, raw);

  // Fonts that carry a ToUnicode table, by object number.
  const fontCMaps = new Map<number, CMap>();
  for (const [num, obj] of objects) {
    const ref = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(obj.dict);
    if (!ref || !/\/Font\b|\/BaseFont/.test(obj.dict)) continue;
    const cmapObj = objects.get(Number(ref[1]));
    if (cmapObj?.stream) fontCMaps.set(num, parseCMap(latin1(cmapObj.stream)));
  }
  // Resource names (/F1 …) to fonts. Names are only unique within a page, so
  // each page's text is read with that page's own fonts.
  const fontNames = (resources: string): Map<string, CMap | null> => {
    const names = new Map<string, CMap | null>();
    let fontDict = /\/Font\s*<<([\s\S]*?)>>/.exec(resources)?.[1];
    const ref = /\/Font\s+(\d+)\s+\d+\s+R/.exec(resources);
    if (!fontDict && ref) fontDict = objects.get(Number(ref[1]))?.dict;
    for (const m of (fontDict ?? "").matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g))
      names.set(m[1], fontCMaps.get(Number(m[2])) ?? null);
    return names;
  };
  const resourcesOf = (dict: string, depth = 0): string => {
    const inline = /\/Resources\s*<<([\s\S]*>>)/.exec(dict);
    if (inline) return inline[1];
    const ref = /\/Resources\s+(\d+)\s+\d+\s+R/.exec(dict);
    if (ref) return objects.get(Number(ref[1]))?.dict ?? "";
    const parent = /\/Parent\s+(\d+)\s+\d+\s+R/.exec(dict);
    if (parent && depth < 20) return resourcesOf(objects.get(Number(parent[1]))?.dict ?? "", depth + 1);
    return "";
  };

  const out: string[] = [];
  const done = new Set<number>();
  const readStream = (num: number, fonts: Map<string, CMap | null>) => {
    const obj = objects.get(num);
    if (!obj?.stream || done.has(num)) return;
    done.add(num);
    const content = latin1(obj.stream);
    if (!/\bBT\b/.test(content)) return;
    const text = textFromContent(content, fonts);
    if (text.trim()) out.push(text);
  };
  // Pages in document order (object order is close enough for reading).
  for (const [, obj] of objects) {
    if (!/\/Type\s*\/Page\b/.test(obj.dict)) continue;
    const fonts = fontNames(resourcesOf(obj.dict));
    const contents = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(obj.dict)?.[1] ?? "";
    for (const ref of contents.matchAll(/(\d+)\s+\d+\s+R/g)) readStream(Number(ref[1]), fonts);
  }
  // Anything not reached through a page (rare): every font name we know.
  const allFonts = new Map<string, CMap | null>();
  for (const obj of objects.values()) for (const [k, v] of fontNames(obj.dict)) if (!allFonts.has(k) || v) allFonts.set(k, v);
  for (const [num, obj] of objects) {
    if (!obj.stream || /\/Subtype\s*\/Image|\/FontFile|\/Length1|\/Type\s*\/(XRef|ObjStm)|CIDInit/.test(obj.dict))
      continue;
    readStream(num, allFonts);
  }
  const joined = out.join("\n");
  // Mostly symbols means fonts we couldn't decode: better to say there's no text.
  const visible = joined.replace(/\s/g, "").length;
  const letters = joined.replace(/[^\p{L}\p{N}]/gu, "").length;
  return visible > 0 && letters >= Math.max(10, visible * 0.5) ? joined : "";
}

function inflatePdf(data: Uint8Array): Uint8Array | null {
  try {
    return new Uint8Array(inflateSync(data, { maxOutputLength: MAX_UNZIPPED_BYTES }));
  } catch {
    return null;
  }
}

/** Apply a stream's filters in order; null when one isn't supported (images, mostly). */
function decodeStream(dict: string, data: Uint8Array): Uint8Array | null {
  const filterText = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict)?.[1] ?? "";
  const filters = [...filterText.matchAll(/\/(\w+)/g)].map((m) => m[1]);
  let out: Uint8Array | null = data;
  for (const filter of filters) {
    if (!out) return null;
    if (filter === "FlateDecode" || filter === "Fl") out = inflatePdf(out);
    else if (filter === "ASCII85Decode" || filter === "A85") out = ascii85(out);
    else if (filter === "ASCIIHexDecode" || filter === "AHx")
      out = new Uint8Array(hexBytes(latin1(out).replace(/>.*$/s, "")));
    else return null;
  }
  return out;
}

function ascii85(data: Uint8Array): Uint8Array | null {
  const text = latin1(data).replace(/\s/g, "").replace(/^<~/, "").replace(/~>.*$/s, "");
  const out: number[] = [];
  let group: number[] = [];
  for (const ch of text) {
    if (ch === "z" && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    const c = ch.charCodeAt(0) - 33;
    if (c < 0 || c > 84) return null;
    group.push(c);
    if (group.length === 5) {
      let v = 0;
      for (const d of group) v = v * 85 + d;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group = [];
    }
  }
  if (group.length > 0) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const d of group) v = v * 85 + d;
    const tail = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...tail.slice(0, n - 1));
  }
  return new Uint8Array(out);
}

function readPdfObjects(bytes: Uint8Array, raw: string): Map<number, PdfObject> {
  const objects = new Map<number, PdfObject>();
  const objRe = /(\d+)\s+\d+\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = objRe.exec(raw))) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const end = raw.indexOf("endobj", bodyStart);
    if (end < 0) break;
    const body = raw.slice(bodyStart, end);
    const streamAt = body.search(/stream\r?\n/);
    let dict = body;
    let stream: Uint8Array | null = null;
    if (streamAt >= 0) {
      dict = body.slice(0, streamAt);
      const dataStart = bodyStart + streamAt + (body[streamAt + 6] === "\r" ? 8 : 7);
      const dataEnd = raw.lastIndexOf("endstream", end);
      stream = decodeStream(dict, bytes.subarray(dataStart, Math.max(dataStart, dataEnd)));
    }
    objects.set(num, { dict, stream });
    objRe.lastIndex = end + 6;
  }
  // Newer PDFs pack small objects (font dictionaries, say) into object streams.
  for (const obj of [...objects.values()]) {
    if (!obj.stream || !/\/Type\s*\/ObjStm/.test(obj.dict)) continue;
    const first = Number(/\/First\s+(\d+)/.exec(obj.dict)?.[1] ?? 0);
    const text = latin1(obj.stream);
    const header = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i + 1 < header.length; i += 2) {
      const start = first + header[i + 1];
      const stop = i + 3 < header.length ? first + header[i + 3] : text.length;
      if (!objects.has(header[i])) objects.set(header[i], { dict: text.slice(start, stop), stream: null });
    }
  }
  return objects;
}

const hexBytes = (hex: string): number[] => {
  const clean = hex.replace(/[^0-9a-f]/gi, "");
  const even = clean.length % 2 ? `${clean}0` : clean;
  const out: number[] = [];
  for (let i = 0; i < even.length; i += 2) out.push(Number.parseInt(even.slice(i, i + 2), 16));
  return out;
};

const utf16be = (hex: string): string => {
  const b = hexBytes(hex);
  let s = "";
  for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
  if (b.length % 2) s += String.fromCharCode(b[b.length - 1]);
  return s;
};

export function parseCMap(text: string): CMap {
  const map = new Map<number, string>();
  const range = /begincodespacerange\s*<([0-9a-f]+)>/i.exec(text);
  const width = range ? Math.max(1, Math.ceil(range[1].length / 2)) : 2;
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const pair of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]*)>/gi))
      map.set(Number.parseInt(pair[1], 16), utf16be(pair[2]));
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const r of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<[0-9a-f]*>|\[[^\]]*\])/gi)) {
      const lo = Number.parseInt(r[1], 16);
      const hi = Math.min(Number.parseInt(r[2], 16), lo + 65535);
      if (r[3].startsWith("[")) {
        const items = [...r[3].matchAll(/<([0-9a-f]*)>/gi)];
        for (let c = lo; c <= hi && c - lo < items.length; c += 1) map.set(c, utf16be(items[c - lo][1]));
      } else {
        const base = utf16be(r[3].slice(1, -1));
        const last = base.charCodeAt(base.length - 1);
        for (let c = lo; c <= hi; c += 1)
          map.set(c, base.slice(0, -1) + String.fromCharCode(last + (c - lo)));
      }
    }
  }
  return { width, map };
}

function decodeString(bytes: number[], cmap: CMap | null | undefined): string {
  if (!cmap || cmap.map.size === 0) return String.fromCharCode(...bytes);
  let s = "";
  for (let i = 0; i + cmap.width <= bytes.length; i += cmap.width) {
    let code = 0;
    for (let k = 0; k < cmap.width; k += 1) code = (code << 8) | bytes[i + k];
    s += cmap.map.get(code) ?? "";
  }
  return s;
}

function literalBytes(literal: string): number[] {
  const body = literal.slice(1, -1);
  const out: number[] = [];
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch !== "\\") {
      out.push(body.charCodeAt(i) & 0xff);
      continue;
    }
    const next = body[i + 1] ?? "";
    i += 1;
    if (next === "n") out.push(10);
    else if (next === "r") out.push(13);
    else if (next === "t") out.push(9);
    else if (next === "b") out.push(8);
    else if (next === "f") out.push(12);
    else if (/[0-7]/.test(next)) {
      let oct = next;
      while (oct.length < 3 && /[0-7]/.test(body[i + 1] ?? "")) oct += body[++i];
      out.push(Number.parseInt(oct, 8) & 0xff);
    } else if (next === "\r" || next === "\n") {
      if (next === "\r" && body[i + 1] === "\n") i += 1;
    } else out.push(next.charCodeAt(0) & 0xff);
  }
  return out;
}

/** Split a content stream into tokens; string literals may hold balanced (nested) brackets. */
function* pdfTokens(content: string): Generator<string> {
  const simple = /<[0-9a-fA-F\s]*>|\[|\]|\/[^\s/<>[\]()]+|-?\d*\.?\d+|[A-Za-z'"*]+/y;
  let i = 0;
  while (i < content.length) {
    const ch = content[i];
    if (ch === "(") {
      let depth = 0;
      let j = i;
      for (; j < content.length; j += 1) {
        const c = content[j];
        if (c === "\\") {
          j += 1;
          continue;
        }
        if (c === "(") depth += 1;
        else if (c === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      yield content.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "%") {
      const nl = content.indexOf("\n", i);
      i = nl < 0 ? content.length : nl + 1;
      continue;
    }
    simple.lastIndex = i;
    const m = simple.exec(content);
    if (m && m.index === i && m[0].length > 0) {
      yield m[0];
      i += m[0].length;
    } else {
      i += 1;
    }
  }
}

/** Read text-showing operators, switching fonts on Tf. */
function textFromContent(content: string, fonts: Map<string, CMap | null>): string {
  const parts: string[] = [];
  let font: CMap | null | undefined;
  let lastName = "";
  let inArray = false;
  for (const tok of pdfTokens(content)) {
    if (tok.startsWith("(")) parts.push(decodeString(literalBytes(tok), font));
    else if (tok.startsWith("<")) parts.push(decodeString(hexBytes(tok.slice(1, -1)), font));
    else if (tok === "[") inArray = true;
    else if (tok === "]") inArray = false;
    else if (tok.startsWith("/")) lastName = tok.slice(1);
    else if (/^-?\d*\.?\d+$/.test(tok)) {
      // A big negative kerning gap inside TJ is a word space.
      if (inArray && Number(tok) < -200) parts.push(" ");
    } else if (tok === "Tf") font = fonts.get(lastName);
    else if (tok === "Td" || tok === "TD" || tok === "T*" || tok === "'" || tok === '"' || tok === "ET")
      parts.push("\n");
    else if (tok === "Tm") parts.push(" ");
  }
  return parts.join("");
}
