const STORY_SHEET = "사연 접수";
const COUNSELING_SHEET = "상담 신청";

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const props = PropertiesService.getScriptProperties();
    if (!data.secret || data.secret !== props.getProperty("SUBMISSION_SECRET")) {
      return json_({ ok: false, error: "unauthorized" });
    }

    lock.waitLock(10000);
    const spreadsheet = SpreadsheetApp.openById(props.getProperty("SPREADSHEET_ID"));
    const receivedAt = new Date();

    if (data.type === "story") {
      const sheet = sheet_(spreadsheet, STORY_SHEET, [
        "접수일시", "상태", "닉네임", "사연", "콘텐츠 활용 동의"
      ]);
      sheet.appendRow([
        receivedAt, "신규", safe_(data.nickname || "익명"),
        safe_(data.story), safe_(data.contentConsent || "동의하지 않음")
      ]);
    } else if (data.type === "counseling") {
      const sheet = sheet_(spreadsheet, COUNSELING_SHEET, [
        "접수일시", "상태", "이름·닉네임", "연령대", "연락처",
        "상담 유형", "희망 요일·시간", "간단한 신청 이유"
      ]);
      sheet.appendRow([
        receivedAt, "신규", safe_(data.name), safe_(data.ageGroup),
        safe_(data.contact), safe_(data.service), safe_(data.preferredTime),
        safe_(data.reason)
      ]);
    } else {
      return json_({ ok: false, error: "invalid type" });
    }

    const notifyEmail = props.getProperty("NOTIFY_EMAIL");
    if (notifyEmail) {
      MailApp.sendEmail(
        notifyEmail,
        "[아우데] 새로운 " + (data.type === "story" ? "사연" : "상담 신청") + "이 도착했습니다.",
        "Google Sheet에서 접수 내용을 확인해 주세요.\n\n민감한 내용은 이메일 본문에 포함하지 않았습니다."
      );
    }

    return json_({ ok: true });
  } catch (error) {
    return json_({ ok: false, error: "save failed" });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function sheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sheet;
}

function safe_(value) {
  const text = String(value || "").trim();
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
