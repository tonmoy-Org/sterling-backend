require('dotenv').config();
const { chromium } = require('playwright');

function formatDate(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

async function selectStatus(page, statusName) {
  const btn = page.locator(`button[title="${statusName}"]`);
  if (await btn.count()) {
    await btn.click();
  }
}

async function setDateFilter(page, startDate, endDate, startTime = '', endTime = '') {
  const dateFilterDropdown = page.locator('div.filter-dropdown:has(.time-filter) div.filter-text').first();
  if (await dateFilterDropdown.count()) {
    await dateFilterDropdown.click();
  }

  const startInput = page.locator('#start-date-filter');
  const endInput = page.locator('#end-date-filter');

  await startInput.fill('');
  await startInput.fill(startDate);
  await endInput.fill('');
  await endInput.fill(endDate);

  if (startTime) {
    const startTimeInput = page.locator('#startTime');
    await startTimeInput.fill('');
    await startTimeInput.fill(startTime);
  }

  if (endTime) {
    const endTimeInput = page.locator('#endTime');
    await endTimeInput.fill('');
    await endTimeInput.fill(endTime);
  }
}

async function applyFilters(page) {
  const applyBtn = page.locator('.plot-map-button:has-text("Apply")');
  if (await applyBtn.count()) {
    await applyBtn.click();
  }
  await page.waitForTimeout(2000);
}

async function scrapeLocatesDispatchBoard() {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://login.fieldedge.com/Account/Login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="UserName"]', process.env.DASH_EMAIL);
  await page.fill('input[name="Password"]', process.env.DASH_PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('input[type="submit"][value="Sign in to your account"]'),
  ]);

  await page.goto('https://login.fieldedge.com/Dispatch', { waitUntil: 'domcontentloaded' });
  await selectStatus(page, 'Completed');

  const startDate = formatDate('2025-12-01');
  const endDate = formatDate('2025-12-31');
  await setDateFilter(page, startDate, endDate);
  await applyFilters(page);

  await page.waitForSelector('.kgRow', { timeout: 60000 });

  const scraped = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('.kgRow').forEach(row => {
      const cells = row.querySelectorAll('.kgCell');
      const getText = (i) => cells[i]?.textContent.trim() || '';

      const priorityEl = cells[0]?.querySelector('div[style*="background-color"]');
      const tagEls = row.querySelectorAll('.tag-label') || [];

      rows.push({
        priorityColor: priorityEl?.style.backgroundColor || '',
        priorityName: getText(1),
        workOrderNumber: getText(2),
        customerPO: getText(3),
        customerName: getText(4),
        customerAddress: getText(5),
        tags: Array.from(tagEls).map(t => t.textContent.trim()).join(', '),
        techName: getText(7),
        promisedAppointment: getText(8),
        createdDate: getText(9),
        completedDate: getText(10),
        taskDuration: getText(12),
        purchaseStatus: getText(13)
      });
    });

    const dispatchDate = document.querySelector('.dispatch-date, .date-header')?.textContent.trim() || '';

    return { dispatchDate, rows };
  });

  await browser.close();

  return {
    filterStartDate: startDate,
    filterEndDate: endDate,
    dispatchDate: scraped.dispatchDate,
    workOrders: scraped.rows,
    totalWorkOrders: scraped.rows.length,
  };
}

module.exports = { scrapeLocatesDispatchBoard };
