// Run against a local server: AUDE_TEST_URL=http://127.0.0.1:3000 node tests/story-browser-check.cjs
// Requires Playwright and its Chromium browser. API calls are intercepted; no real submissions.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const options = { headless: true };
  if (process.env.AUDE_CHROMIUM_MODULE) {
    const { default: binary } = await import(process.env.AUDE_CHROMIUM_MODULE);
    options.args = binary.args;
    options.executablePath = process.env.AUDE_CHROMIUM_PATH || await binary.executablePath();
  }
  const browser = await chromium.launch(options);
  try {
    const page = await browser.newPage();
    const submissions = [];
    let mode = 'fail';
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/submit') {
        submissions.push(route.request().postDataJSON());
        if (mode === 'hang') return;
        return route.fulfill({ status: mode === 'fail' ? 500 : 200, json: mode === 'fail' ? { error: 'test' } : { ok: true } });
      }
      if (path === '/api/counseling-status') return route.fulfill({ json: { counselingOpen: true, assessmentOpen: true } });
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(process.env.AUDE_TEST_URL || 'http://127.0.0.1:3000');
    const story = page.locator('#story-message');
    const next = page.locator('.letterSend');
    const privacy = page.locator('[name=privacyConsent]');
    const dialog = page.locator('dialog.storyConfirmation');
    const send = dialog.getByRole('button', { name: '동의하고 사연 보내기' });
    const consent = dialog.getByRole('checkbox');
    for (const width of [320, 360, 390, 600, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('#story').scrollIntoViewIfNeeded();
      const overflow = await page.locator('#story').evaluate(el => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow, false, `story overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await story.fill('회귀 검증 사연\n두 번째 줄');
    await next.click();
    assert.equal(await dialog.count(), 0, 'privacy consent is required');
    await page.locator('.letterCheck button').click();
    await page.getByRole('button', { name: '확인했습니다', exact: true }).click();
    assert.equal(await story.inputValue(), '회귀 검증 사연\n두 번째 줄');
    assert.equal(await privacy.isChecked(), false);
    await privacy.check();
    await story.fill('   ');
    await next.click();
    assert.equal(await dialog.count(), 0);
    assert.equal(await story.evaluate(el => el === document.activeElement), true);
    await story.fill('가'.repeat(5000));
    assert.match(await page.locator('#story-length').textContent(), /최대 글자 수/);
    await story.fill('회귀 검증 사연');
    await next.click();
    assert.equal(await send.isDisabled(), true);
    await consent.check();
    await dialog.getByRole('button', { name: '돌아가서 수정' }).click();
    await story.fill('수정한 사연');
    await next.click();
    assert.equal(await consent.isChecked(), false);
    assert.equal(submissions.length, 0, 'opening confirmation must not submit');
    await consent.check();
    await send.click();
    await dialog.locator('[role=alert]').waitFor();
    assert.equal(await story.inputValue(), '수정한 사연');
    assert.equal(submissions[0].privacyConsent, true);
    assert.equal(submissions[0].contentConsent, '동의');
    mode = 'hang';
    await send.click();
    await page.waitForFunction(() => document.querySelector('dialog [role=status]')?.textContent.includes('늦어지고'));
    await page.waitForFunction(() => document.querySelector('dialog [role=alert]')?.textContent.includes('지연되고'), null, { timeout: 25000 });
    assert.equal(await send.isEnabled(), true, 'timeout releases the busy state');
    mode = 'success';
    await send.click();
    await page.locator('.letterSuccess').waitFor();
    assert.equal(submissions.length, 3);
    assert.equal(new Set(submissions.map(item => item.requestId)).size, 1, 'retries reuse the same key');
    assert.equal(await page.locator('.letterSuccess h3').evaluate(el => el === document.activeElement), true);
    const box = await page.locator('.letterSuccess h3').boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 844, 'completion heading is in view');
    assert.equal(await page.locator('.letterForm').count(), 0);
    console.log('PASS: seven viewport widths, optional fields, privacy round-trip, whitespace, character limit, consent reset, failure preservation, timeout, retry identity and success focus');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
