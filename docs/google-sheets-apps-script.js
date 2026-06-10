/**
 * Google Apps Script receiver for SLB Fan Feedback.
 *
 * Setup:
 * 1. Create a Google Sheet.
 * 2. Extensions -> Apps Script.
 * 3. Paste this file into Code.gs.
 * 4. Deploy -> New deployment -> Web app.
 * 5. Execute as: Me.
 * 6. Who has access: Anyone.
 * 7. Copy the Web app URL into Vercel as GOOGLE_SHEETS_WEBHOOK_URL.
 */

const SHEET_NAME = "Submissions";

const HEADERS = [
  "receivedAt",
  "submittedAt",
  "requestId",
  "audience",
  "email",
  "consent",
  "overall",
  "recommend",
  "ratingsJson",
  "choicesJson",
  "highlight",
  "improve",
  "page",
  "country",
  "region",
  "city",
  "userAgent",
  "fullPayloadJson",
];

function doPost(event) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const payload = JSON.parse(event.postData.contents);
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.setFrozenRows(1);
    }

    const answers = payload.answers || {};
    const meta = payload.meta || {};

    sheet.appendRow([
      payload.receivedAt || new Date().toISOString(),
      payload.submittedAt || "",
      payload.requestId || "",
      payload.audience || "",
      answers.email || "",
      Boolean(answers.consent),
      answers.overall ?? "",
      answers.recommend ?? "",
      JSON.stringify(answers.ratings || {}),
      JSON.stringify(answers.choices || {}),
      answers.highlight || "",
      answers.improve || "",
      meta.page || "",
      meta.country || "",
      meta.region || "",
      meta.city || "",
      meta.userAgent || "",
      JSON.stringify(payload),
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
