const INTAKE_SHEET = "접수면접";
const TEST_SHEET = "심리검사";
const STORY_SHEET = "사연";

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
    let category = "";

    if (data.type === "story") {
      category = "사연";
      const sheet = sheet_(spreadsheet, STORY_SHEET, [
        "접수번호", "접수일시", "상태", "닉네임", "사연", "콘텐츠 활용 동의"
      ]);
      sheet.appendRow([
        nextId_(props, "S", receivedAt), receivedAt, "신규",
        safe_(data.nickname || "익명"), safe_(data.story),
        safe_(data.contentConsent || "동의하지 않음")
      ]);
    } else if (data.type === "counseling" && data.service === "심리검사·해석상담") {
      category = "심리검사";
      const sheet = sheet_(spreadsheet, TEST_SHEET, [
        "접수번호", "접수일시", "상태", "이름·닉네임", "연령대",
        "연락처", "희망 검사", "희망 요일·시간", "간단한 신청 이유"
      ]);
      sheet.appendRow([
        nextId_(props, "T", receivedAt), receivedAt, "신규",
        safe_(data.name), safe_(data.ageGroup), safe_(data.contact),
        safe_(data.service), safe_(data.preferredTime), safe_(data.reason)
      ]);
    } else if (data.type === "counseling") {
      category = "접수면접";
      const sheet = sheet_(spreadsheet, INTAKE_SHEET, [
        "접수번호", "접수일시", "상태", "이름·닉네임", "연령대",
        "연락처", "상담 유형", "희망 요일·시간", "간단한 신청 이유"
      ]);
      sheet.appendRow([
        nextId_(props, "I", receivedAt), receivedAt, "신규",
        safe_(data.name), safe_(data.ageGroup), safe_(data.contact),
        safe_(data.service), safe_(data.preferredTime), safe_(data.reason)
      ]);
    } else {
      return json_({ ok: false, error: "invalid type" });
    }

    const notifyEmail = props.getProperty("NOTIFY_EMAIL");
    if (notifyEmail) {
      MailApp.sendEmail(
        notifyEmail,
        "[아우데] 새로운 " + category + " 신청이 도착했습니다.",
        "Google Sheet의 '" + category + "' 탭에서 확인해 주세요.\n\n민감한 내용은 이메일 본문에 포함하지 않았습니다."
      );
    }

    return json_({ ok: true });
  } catch (error) {
    return json_({ ok: false, error: "save failed" });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function nextId_(props, prefix, date) {
  const year = Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy");
  const key = "COUNTER_" + prefix + "_" + year;
  const next = Number(props.getProperty(key) || "0") + 1;
  props.setProperty(key, String(next));
  return prefix + "-" + year + "-" + String(next).padStart(4, "0");
}

function sheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#242622")
      .setFontColor("#f4f0e7");
    sheet.autoResizeColumns(1, headers.length);
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
