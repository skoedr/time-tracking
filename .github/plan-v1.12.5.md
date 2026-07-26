# v1.12.5 — PDF-Merge: factur-X / ZUGFeRD XML-Einbettung erhalten

> **Nordstern:** „Eine zusammengeführte PDF ist immer noch eine gültige E-Rechnung."

## Kontext & Problem

Seit Einführung der **E-Rechnungspflicht in Deutschland (ab 2025)** müssen
Rechnungen als factur-X / ZUGFeRD-konforme PDFs mit eingebettetem XML versendet
werden. Viele Rechnungsprogramme (z. B. Lexware, sevDesk, DATEV) exportieren
bereits solche PDFs.

Die `pdf:merge-export`- und `pdf:merge-only`-Funktionen von TimeTrack verwenden
`pdf-lib`, das beim Zusammenführen zweier PDFs das `EmbeddedFiles`-Dictionary der
Ursprungs-PDF **still verwirft** — das eingebettete XML geht verloren. Das
resultierende Dokument ist zwar eine valide PDF, aber **kein gültiges
E-Rechnungs-PDF mehr**.

---

## Technischer Hintergrund

### Aufbau eines factur-X / ZUGFeRD PDFs

Ein konformes E-Rechnungs-PDF enthält:

1. Ein eingebettetes XML-Attachment mit festem Namen (z. B. `factur-x.xml`,
   `ZUGFeRD-invoice.xml`, `xrechnung.xml`)
2. Dieses Attachment sitzt im PDF-Catalog unter `/Names → /EmbeddedFiles`
3. Das Attachment-Dictionary hat Metadaten-Keys: `/AFRelationship` (= `/Data`),
   `/Desc`, `/Type`, `/Subtype`
4. Ergänzend: `/AF`-Array im Catalog, der auf das Attachment-File-Spec-Object zeigt
5. XMP-Metadaten in der PDF enthalten `fx:ConformanceLevel`, `fx:DocumentType`

### Was `pdf-lib` kann und nicht kann

`pdf-lib` **kann:**

- Low-level PDF-Dictionary-Objekte lesen (`PDFDict`, `PDFName`, `PDFRef`)
- Rohe PDF-Bytes extrahieren
- Neue Attachment-Einträge in ein `PDFDocument` schreiben via
  `doc.catalog.set(PDFName.of('Names'), ...)` + manuelle Dict-Konstruktion

`pdf-lib` **kann nicht** (kein High-Level-API):

- `embedFile()` im Sinne von "nimm dieses File-Spec-Objekt aus Doc A und kopiere
  es 1:1 in Doc B" — das muss manuell über `PDFRef` und `PDFDict` passieren

### Lösungsansatz: Parse-Extract-Re-embed in `mergePdfs()`

**Phase 1 — Extrahieren aus der Invoice-PDF:**

```
invoiceDoc.catalog → /Names → /EmbeddedFiles → /Names → Array[name, fileSpecRef]
```

Für jeden Eintrag: `fileSpecRef` → `PDFDict` → `/EF` → `/F` (= embedded stream ref)
→ rohe Bytes via `invoiceDoc.context.lookup(streamRef)` → `PDFRawStream.contents`

**Phase 2 — In die gemergte PDF einfügen:**
Neue `PDFDict` für das File-Spec-Object mit identischen Metadaten-Keys anlegen.
Den Raw-Stream in den neuen Dokument-Context via `mergedDoc.context.register()`
aufnehmen. Namen-Tree und `/AF`-Array im neuen Catalog setzen.

**Phase 3 — XMP-Metadaten:** _out of scope für v1.12.5._
Ein Wholesale-Copy des `/Metadata`-Streams würde die Metadaten der gemergten PDF
korrumpieren (Seitenzahl, Erstellungsdatum). Ein selektiver XMP-Namespace-Merge
(`fx:`, `rsm:`) wäre korrekt, ist aber XML-Parsing auf einem eigenen Fehlerpfad.
Als TODO-Kommentar im Code vermerkt, für v1.13 geplant.

> **Eng-Review-Finding A1 (P1):** XMP wholesale copy entfernt.

---

## Scope v1.12.5

### 1. `src/main/pdfMerge.ts` — `mergePdfs()` erweitern

- Neue **exportierte** Funktion `extractEmbeddedFiles(doc: PDFDocument): EmbeddedFileEntry[]`
  - `EmbeddedFileEntry = { name: PDFHexString; streamContents: Uint8Array; streamDict: PDFDict; afRelationship?: PDFName }`
  - Traversiert `/Names → /EmbeddedFiles → /Names`-Array (flat und B-Tree via rekursiver
    `traverseNameTree(doc, node)` Hilfsfunktion — Eng-Review-Finding A2)
  - Gibt leeres Array zurück wenn kein `EmbeddedFiles`-Entry existiert
  - Gibt leeres Array zurück wenn Struktur unerwartet ist (graceful degradation)

> **Eng-Review-Finding A2:** B-Tree-Traversal implementieren (rekursiv ~20 Zeilen).
> **Eng-Review-Finding CQ1+CQ2:** Funktionen exportiert, Typ korrigiert.

- Neue **exportierte** Funktion `reembedFiles(target: PDFDocument, entries: EmbeddedFileEntry[]): void`
  - Registriert Stream-Bytes in `target.context`
  - Baut neues Names-Tree-Dict
  - Setzt `/Names → /EmbeddedFiles` im Catalog
  - Setzt `/AF`-Array im Catalog

- `mergePdfs()` ruft nach dem Merge `extractEmbeddedFiles(invDoc)` und
  `reembedFiles(merged, ...)` auf — transparent, kein API-Break

- Kein XMP-Copy — TODO-Kommentar im Code für spätere Version

### 2. `src/main/pdfMerge.test.ts` — Tests

- `extractEmbeddedFiles()`: Unit-Test mit synthetischem PDF, das ein
  `EmbeddedFiles`-Dictionary enthält
- `reembedFiles()`: prüft dass `/Names/EmbeddedFiles` und `/AF` im Zieldokument
  gesetzt sind
- `mergePdfs()` Integration: merged PDF hat `EmbeddedFiles` aus dem Invoice-Input
- Graceful-Degradation: mergePdfs mit einem normalen PDF (ohne Attachments)
  funktioniert weiterhin ohne Fehler
- Namen-Check: der XML-Dateiname (`factur-x.xml` o.ä.) bleibt erhalten

### 3. i18n (de + en) — kein neuer Text nötig

Keine UI-Änderung — reine Backend-Logik.

---

## Out of Scope

- **Validierung ob das XML gültig/konform ist** — wir übertragen nur, was da ist
- **Erzeugen von factur-X-XML** — TimeTrack erstellt keine E-Rechnungen, nur
  den Stundennachweis-Anhang
- **Unterstützung verschlüsselter PDFs** — `pdf-lib` kann diese ohnehin nicht laden
- **UI für "E-Rechnung erkannt"-Badge** — nice to have, aber nicht in 1.12.5

---

## Risiken & Mitigationen

| Risiko                                                           | Mitigation                                                                                                                              |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pdf-lib` Names-Tree-Struktur variiert je nach Ursprungsprogramm | `extractEmbeddedFiles()` gibt bei unbekannter Struktur leeres Array zurück — Merge geht ohne Attachment durch, kein Crash               |
| Stream-Bytes korrekt kopieren ohne Dekomprimierung               | `PDFRawStream.contents` liefert rohe Bytes (ggf. komprimiert) — beim Re-embed identisch übernehmen, Kompressionsfilter-Dict mitkopieren |
| Sehr große Attachments (>5 MB XML)                               | Keine Sonderbehandlung — der bestehende 50-MB-Limit-Check für die Eingabe-PDFs ist ausreichend                                          |
| XMP-Metadaten (konformance Level) fehlen in merged PDF           | Akzeptiertes Tradeoff für v1.12.5 — TODO für XMP-Namespace-Merge in v1.13                                                               |
| B-Tree Names-Struktur in großen PDFs                             | Rekursive `traverseNameTree()` Funktion traversiert sowohl flat als auch B-Tree Nodes                                                   |

---

## Ship-Kriterium

Du nimmst eine von sevDesk / Lexware / DATEV exportierte E-Rechnung (factur-X
Level EN16931). Du mergst sie mit dem TimeTrack-Stundennachweis. Du öffnest das
Ergebnis in einem PDF-Viewer oder prüfst es mit dem [Mustang-Validator] —
das XML-Attachment ist vorhanden und valide.

---

## Versionsstrategie

- Branch: `fix/115-pdf-merge-facturx`
- Basis: `main` (nach v1.12.0)
- Ziel-Version: `1.12.5` (Patch-Release, kein Breaking Change, kein DB-Schema)
- Kein neuer Migrations-Schritt nötig

---

## Abhängigkeiten

Keine neuen npm-Packages nötig — `pdf-lib` (bereits installiert) erlaubt Low-Level-Dict-Zugriff.

Falls sich zeigt dass der Low-Level-Ansatz in `pdf-lib` zu fragil ist:
Fallback-Option `hummus-recipe` oder `node-qpdf` evaluieren (beide können
Attachments kopieren ohne das PDF neu zu rendern).
