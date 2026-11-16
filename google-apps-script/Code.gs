const GOOGLE_FORM_VIEW_URL = `https://docs.google.com/forms/d/e/1FAIpQLSekshsmNRDCAaJ-_kEqIaf-cbou1zwdyZraWfkigPDs-7VM5w/viewform`;
const GOOGLE_FORM_RESPONSE_URL = `https://docs.google.com/forms/d/e/1FAIpQLSekshsmNRDCAaJ-_kEqIaf-cbou1zwdyZraWfkigPDs-7VM5w/formResponse`;
const GOOGLE_FORM_ENTRY_IDS = {
  id: `entry.513263938`,
  name: `entry.1386401146`,
  turma: `entry.618162929`,
  scorePct: `entry.437763456`,
  mencao: `entry.356674803`,
  durationSec: `entry.297992542`,
  durationStr: `entry.215533379`,
  startTime: `entry.833544290`,
  endTime: `entry.933698642`,
  diagSummary: `entry.1994263660`,
  topicErrors: `entry.768678869`
};

function doPost(event) {
  let recordId = ``;
  try {
    const payload = event && event.parameter ? event.parameter.payload : ``;
    if (!payload) throw new Error(`Dados ausentes.`);

    const record = JSON.parse(payload);
    validateRecord(record);
    recordId = record.id;
    submitRecordToGoogleForm(record);
    return createResponse(true, recordId);
  } catch (error) {
    console.error(error);
    return createResponse(false, recordId);
  }
}

function submitRecordToGoogleForm(record) {
  const formPage = UrlFetchApp.fetch(GOOGLE_FORM_VIEW_URL, {
    headers: { 'Accept-Language': `en` },
    muteHttpExceptions: true
  });
  if (formPage.getResponseCode() !== 200) {
    throw new Error(`Não foi possível abrir o Google Forms.`);
  }

  const formHtml = formPage.getContentText();
  const payload = {
    fvv: getHiddenInputValue(formHtml, `fvv`),
    partialResponse: getHiddenInputValue(formHtml, `partialResponse`),
    pageHistory: getHiddenInputValue(formHtml, `pageHistory`),
    fbzx: getHiddenInputValue(formHtml, `fbzx`),
    submissionTimestamp: getHiddenInputValue(formHtml, `submissionTimestamp`),
    [GOOGLE_FORM_ENTRY_IDS.id]: record.id,
    [GOOGLE_FORM_ENTRY_IDS.name]: record.name,
    [GOOGLE_FORM_ENTRY_IDS.turma]: record.turma,
    [GOOGLE_FORM_ENTRY_IDS.scorePct]: String(record.scorePct),
    [GOOGLE_FORM_ENTRY_IDS.mencao]: record.mencao,
    [GOOGLE_FORM_ENTRY_IDS.durationSec]: String(record.durationSec),
    [GOOGLE_FORM_ENTRY_IDS.durationStr]: record.durationStr,
    [GOOGLE_FORM_ENTRY_IDS.startTime]: record.startTime,
    [GOOGLE_FORM_ENTRY_IDS.endTime]: record.endTime,
    [GOOGLE_FORM_ENTRY_IDS.diagSummary]: record.diagSummary,
    [GOOGLE_FORM_ENTRY_IDS.topicErrors]: JSON.stringify(record.topicErrors)
  };
  const headers = {
    'Accept-Language': `en`,
    Referer: GOOGLE_FORM_VIEW_URL
  };
  const cookieHeader = getCookieHeader(formPage.getAllHeaders());
  if (cookieHeader) headers.Cookie = cookieHeader;

  const response = UrlFetchApp.fetch(GOOGLE_FORM_RESPONSE_URL, {
    method: `post`,
    contentType: `application/x-www-form-urlencoded`,
    payload: payload,
    headers: headers,
    followRedirects: true,
    muteHttpExceptions: true
  });
  const responseText = response.getContentText();
  if (
    response.getResponseCode() !== 200 ||
    !/(Your response has been recorded|Sua resposta foi registrada)/i.test(responseText)
  ) {
    throw new Error(`O Google Forms não confirmou o registro da avaliação.`);
  }
}

function getHiddenInputValue(formHtml, fieldName) {
  const inputTags = formHtml.match(/<input\b[^>]*>/gi) || [];
  for (const tag of inputTags) {
    const nameMatch = tag.match(/\bname=["']([^"']+)["']/i);
    if (!nameMatch || nameMatch[1] !== fieldName) continue;

    const valueMatch = tag.match(/\bvalue=["']([^"']*)["']/i);
    if (!valueMatch) throw new Error(`O campo de sessão ${fieldName} não tem valor.`);
    return decodeHtmlEntities(valueMatch[1]);
  }
  throw new Error(`O Google Forms não forneceu o campo de sessão ${fieldName}.`);
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, `&`)
    .replace(/&quot;/g, `"`)
    .replace(/&#39;|&#x27;/gi, `'`)
    .replace(/&lt;/g, `<`)
    .replace(/&gt;/g, `>`)
    .replace(/&#(\d+);/g, (match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (match, code) => String.fromCharCode(parseInt(code, 16)));
}

function getCookieHeader(headers) {
  const cookieKey = Object.keys(headers).find((key) => key.toLowerCase() === `set-cookie`);
  if (!cookieKey) return ``;

  const cookies = Array.isArray(headers[cookieKey]) ? headers[cookieKey] : [headers[cookieKey]];
  return cookies
    .map((cookie) => String(cookie).split(`;`)[0])
    .filter(Boolean)
    .join(`; `);
}

function validateRecord(record) {
  const allowedClasses = [`1º DS-A`, `1º DS-B`, `1º ADM-A`, `1º ADM-B`];
  if (!record || typeof record !== `object` || Array.isArray(record)) throw new Error(`Registro inválido.`);
  if (typeof record.id !== `string` || !/^exam-\d+$/.test(record.id)) throw new Error(`Identificador inválido.`);
  if (typeof record.name !== `string` || !record.name.trim() || record.name.length > 160) throw new Error(`Nome inválido.`);
  if (!allowedClasses.includes(record.turma)) throw new Error(`Turma inválida.`);
  if (!Number.isInteger(record.scorePct) || record.scorePct < 0 || record.scorePct > 100) throw new Error(`Nota inválida.`);
  if (![ `I`, `R`, `B`, `MB` ].includes(record.mencao)) throw new Error(`Menção inválida.`);
  if (!Number.isInteger(record.durationSec) || record.durationSec < 1) throw new Error(`Duração inválida.`);
  if (typeof record.durationStr !== `string` || typeof record.startTime !== `string` || typeof record.endTime !== `string`) {
    throw new Error(`Horários inválidos.`);
  }
  if (typeof record.diagSummary !== `string` || record.diagSummary.length > 1000) throw new Error(`Diagnóstico inválido.`);
  if (!record.topicErrors || typeof record.topicErrors !== `object` || Array.isArray(record.topicErrors)) {
    throw new Error(`Diagnóstico por eixo inválido.`);
  }
}

function createResponse(ok, recordId) {
  const message = JSON.stringify({
    type: `etec-form-save`,
    ok: ok,
    recordId: recordId,
    message: ok ? `` : `O Google Forms não confirmou o registro da avaliação.`
  });
  return HtmlService
    .createHtmlOutput(`<!doctype html><html><body><script>window.parent.postMessage(${message}, "*");</script></body></html>`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
