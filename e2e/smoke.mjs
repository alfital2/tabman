import { chromium } from 'playwright';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch({
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});

await page.goto(process.env.E2E_URL ?? 'http://localhost:5173/', { waitUntil: 'networkidle' });
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('tabkit.shortcuts-dismissed.v0', '1'); });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// 1. Base render
const svg = page.locator('.tab-sheet-svg svg');
check('svg renders', (await svg.count()) === 1);
const clefText = await svg.locator('text', { hasText: /^T$/ }).count();
check('TAB clef drawn', clefText >= 1);
const measures = await svg.locator('text', { hasText: /^1$/ }).count();
check('measure numbers drawn', measures >= 1);

// 2. Type frets at the cursor (starts at bar 0, beat 0, string 0)
await page.locator('body').click({ position: { x: 10, y: 10 } }); // ensure no input focused
await page.keyboard.press('5');
await page.waitForTimeout(100);
check('typing 5 writes a fret', (await svg.locator('text', { hasText: /^5$/ }).count()) >= 1);

// two-digit combine on a fresh cell
await page.keyboard.press('ArrowRight');
await page.keyboard.press('1');
await page.keyboard.press('2');
await page.waitForTimeout(100);
check('digits combine to 12', (await svg.locator('text', { hasText: /^12$/ }).count()) >= 1);

// chord: down a string, type
await page.keyboard.press('ArrowDown');
await page.keyboard.press('7');
await page.waitForTimeout(100);
check('chord note on another string', (await svg.locator('text', { hasText: /^7$/ }).count()) >= 1);

// 3. Duration brush: shorter (]) then type — stems/beams appear
await page.keyboard.press(']');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('9');
await page.waitForTimeout(100);
const statusbar = await page.locator('.statusbar').textContent();
check('fret 9 written', (await svg.locator('text', { hasText: /^9$/ }).count()) >= 1);
check('brush stepped to 8th', statusbar.includes('8th'), statusbar.trim().slice(0, 80));

// 4. Backspace deletes
await page.keyboard.press('Backspace');
await page.waitForTimeout(100);
check('backspace clears the note', (await svg.locator('text', { hasText: /^9$/ }).count()) === 0);

// 5. Undo/redo via keyboard
await page.keyboard.press('Meta+z');
await page.waitForTimeout(100);
check('cmd+z restores the note', (await svg.locator('text', { hasText: /^9$/ }).count()) >= 1);
await page.keyboard.press('Meta+Shift+z');
await page.waitForTimeout(100);
check('cmd+shift+z redoes', (await svg.locator('text', { hasText: /^9$/ }).count()) === 0);

// 6. Articulation via panel: select note first (click the "12" fret)
const twelve = svg.locator('text', { hasText: /^12$/ }).first();
await twelve.click();
const palmMute = page.locator('.tp-artbtn[aria-label="Palm mute"]');
await palmMute.click();
await page.waitForTimeout(100);
check('palm mute label renders', (await svg.locator('text', { hasText: /PM/ }).count()) >= 1);
const pmActive = await palmMute.evaluate((el) => el.classList.contains('active'));
check('palm mute button active', pmActive);
await palmMute.click(); // toggle off
await page.waitForTimeout(100);
check('palm mute toggles off', (await svg.locator('text', { hasText: /PM/ }).count()) === 0);

// bend popover with variant
await page.locator('.tp-artbtn[aria-label="1½"]').click();
await page.waitForTimeout(100);
check('bend 1½ applies (one-click, no popover)', (await svg.locator('text', { hasText: /^1½$/ }).count()) >= 1);

// 7. Context menu
await twelve.click({ button: 'right' });
await page.waitForTimeout(150);
check('context menu opens', (await page.locator('.context-menu').count()) === 1);
const dupLabel = await page.locator('.menu-item', { hasText: 'Duplicate bar' }).first().textContent();
check('menu targets bar 1', dupLabel.includes('bar 1'), dupLabel);
await page.locator('.menu-item', { hasText: 'Duplicate bar 1' }).click();
await page.waitForTimeout(150);
check('duplicate bar adds fret copy', (await svg.locator('text', { hasText: /^12$/ }).count()) >= 2);
check('context menu closed after action', (await page.locator('.context-menu').count()) === 0);

// 8. Demo scores
await page.evaluate(() => window.__tabkit.loadShowcase());
await page.waitForTimeout(300);
const title = await page.locator('.sheet-title').inputValue();
check('showcase loads', title === 'Feature Showcase', title);
check('harmonic diamond renders', (await svg.locator('text', { hasText: /◇/ }).count()) >= 1);
check('dead note renders as x', (await svg.locator('text', { hasText: /^x$/ }).count()) >= 1);
check('time signature 3/4 change renders', (await svg.locator('text', { hasText: /^3$/ }).count()) >= 1);

// 9. Playback
await page.locator('.tb-play').click();
await page.waitForTimeout(700);
const playing = await page.locator('.tb-play').textContent();
check('play starts (button shows Stop)', playing.includes('Stop'), playing.trim());
const playheadVisible = await svg.locator('.playing-mark').count();
check('playhead column follows', playheadVisible === 1);
await page.locator('.tb-play').click();
await page.waitForTimeout(200);
check('stop works', (await page.locator('.tb-play').textContent()).includes('Play'));

// 10. Persistence across reload
await page.locator('.sheet-title').fill('Persisted Song');
await page.waitForTimeout(700); // debounce
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const persisted = await page.locator('.sheet-title').inputValue();
check('document persists across reload', persisted === 'Persisted Song', persisted);

// 11. Marquee select + delete
await page.evaluate(() => window.__tabkit.loadDemo());
await page.waitForTimeout(300);
const box = await svg.boundingBox();
await page.mouse.move(box.x + 40, box.y + 60);
await page.mouse.down();
await page.mouse.move(box.x + 500, box.y + 140, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(150);
const selText = await page.locator('.statusbar').textContent();
check('marquee selects notes', /selected/.test(selText), selText.trim().slice(0, 60));

// 12. Fill the whole score and keep going — the page must grow, never dead-end
await page.locator('.tb-icon[title="New"]').click();
await page.waitForTimeout(250);
await page.locator('body').click({ position: { x: 10, y: 10 } });
for (let i = 0; i < 17; i++) {
  await page.keyboard.press(String((i % 9) + 1));
  await page.keyboard.press('ArrowRight');
}
await page.waitForTimeout(200);
const measureNumbers = await svg
  .locator('text')
  // measure numbers are the red labels; frets are near-black
  .evaluateAll((els) => els.filter((e) => e.getAttribute('fill') === '#c0392b' && Number(e.textContent) >= 5).length);
check('typing past the last bar grows the score', measureNumbers >= 1);
const statusEnd = await page.locator('.statusbar').textContent();
check('cursor continued into the new bar', /Bar [56]/.test(statusEnd), statusEnd.trim().slice(0, 40));

// 12b. Fresh-doc cursor box is compact (justification slot cap)
await page.locator('.tb-icon[title="New"]').click();
await page.waitForTimeout(200);
const caretW = await page.evaluate(() => document.querySelector('.cursor-caret')?.getBoundingClientRect().width ?? 999);
check('fresh cursor box is compact (not stretched)', caretW < 75, `${Math.round(caretW)}px`);

// 12c. Unpacked articulation variants apply in one click (no popover)
await page.evaluate(() => window.__tabkit.loadDemo());
await page.waitForTimeout(200);
await svg.locator('text', { hasText: /^5$/ }).first().click();
await page.locator('.tp-artbtn', { hasText: 'Nat' }).click();
await page.waitForTimeout(150);
check('one-click harmonic (Nat) applies', (await svg.locator('text', { hasText: /◇/ }).count()) >= 1);

// 12d. Global shortcuts are swallowed while the context menu is open
await svg.locator('text', { hasText: /^0$/ }).first().click({ button: 'right' });
await page.waitForTimeout(150);
await page.keyboard.press('9');
await page.waitForTimeout(120);
check('context menu swallows global shortcut key', (await page.locator('.context-menu').count()) === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(120);
check('Escape closes the context menu', (await page.locator('.context-menu').count()) === 0);

// 12e. Articulation keyboard shortcuts (fresh doc, one note)
await page.evaluate(() => window.__tabkit.loadNew());
await page.waitForTimeout(150);
await page.locator('body').click({ position: { x: 10, y: 10 } });
await page.keyboard.press('7');
await page.waitForTimeout(80);
await page.keyboard.press('h');
await page.waitForTimeout(80);
check('key h applies hammer-on', (await svg.locator('text', { hasText: /^h$/ }).count()) >= 1);
await page.keyboard.press('b');
await page.waitForTimeout(80);
check('key b applies bend (full)', (await svg.locator('text', { hasText: /^full$/ }).count()) >= 1);
await page.keyboard.press('Shift+B');
await page.waitForTimeout(80);
check('Shift+B cycles bend to 1½', (await svg.locator('text', { hasText: /^1½$/ }).count()) >= 1);
await page.keyboard.press('x');
await page.waitForTimeout(80);
check('key x makes a dead note (x notehead)', (await svg.locator('text', { hasText: /^x$/ }).count()) >= 1);

// 13. Export produces a download
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 5000 }),
  page.locator('.tb-icon[title^="Export"]').click(),
]);
check('export downloads a file', download.suggestedFilename().endsWith('.tabkit.json'), download.suggestedFilename());

// 14. Shortcuts dialog: shows on fresh load, help button reopens, dismissal persists
await page.evaluate(() => localStorage.removeItem('tabkit.shortcuts-dismissed.v0'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('shortcuts dialog shows on fresh load', (await page.locator('.sc-dialog').count()) === 1);
await page.locator('.sc-ok').click();
await page.waitForTimeout(100);
check('dialog closes on Got it', (await page.locator('.sc-dialog').count()) === 0);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('dialog reappears when not dismissed', (await page.locator('.sc-dialog').count()) === 1);
await page.locator('.sc-dontshow input').check();
await page.locator('.sc-ok').click();
await page.waitForTimeout(100);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
check('dialog stays dismissed after dont-show-again', (await page.locator('.sc-dialog').count()) === 0);
await page.locator('.tb-icon[title="Keyboard shortcuts"]').click();
await page.waitForTimeout(100);
check('help button reopens the dialog', (await page.locator('.sc-dialog').count()) === 1);
await page.locator('.sc-ok').click();

// 15. Add-chord via right-click: search + pick a voicing inserts a chord
await page.evaluate(() => window.__tabkit.loadNew());
await page.waitForTimeout(150);
await page.locator('body').click({ position: { x: 10, y: 10 } });
await page.keyboard.press('5');
await page.waitForTimeout(100);
await svg.locator('text', { hasText: /^5$/ }).first().click({ button: 'right' });
await page.waitForTimeout(150);
check('context menu has Add chord', (await page.locator('.menu-item', { hasText: 'Add chord' }).count()) === 1);
check('note-duration row uses SVG icons', (await page.locator('.menu-chip.glyph svg').count()) === 5);
await page.locator('.menu-item', { hasText: 'Add chord' }).click();
await page.waitForTimeout(150);
check('chord input opens', (await page.locator('.chord-input-field').count()) === 1);
await page.locator('.chord-input-field').fill('Am7');
await page.waitForTimeout(120);
check('chord suggestions appear', (await page.locator('.chord-input-item').count()) > 0);
check('top suggestion is the typed chord', (await page.locator('.chord-input-item').first().innerText()).trim() === 'Am7');
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
check('chord input closes after picking', (await page.locator('.chord-input-field').count()) === 0);
check('chord name renders above the column', (await svg.locator('text', { hasText: /^Am7$/ }).count()) >= 1);
const chordDoc = await page.evaluate(() => JSON.parse(localStorage.getItem('tabkit.current-document.v0') || 'null'));
const chordNotes = chordDoc?.tracks?.[0]?.bars?.[0]?.voices?.[0]?.beats?.[0]?.notes?.length ?? 0;
check('chord inserted as multiple notes', chordNotes >= 3, `${chordNotes} notes`);

// 16. Click the chord label to retype the chord
await svg.locator('text', { hasText: /^Am7$/ }).first().click();
await page.waitForTimeout(150);
check('clicking chord label reopens the box', (await page.locator('.chord-input-field').count()) === 1);
check('box prefilled with current chord', (await page.locator('.chord-input-field').inputValue()) === 'Am7');
await page.locator('.chord-input-field').fill('C');
await page.waitForTimeout(120);
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
check('retyped chord label updates to C', (await svg.locator('text', { hasText: /^C$/ }).count()) >= 1);
check('old chord label removed', (await svg.locator('text', { hasText: /^Am7$/ }).count()) === 0);

check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
