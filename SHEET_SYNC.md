# 📊 Google Sheets Live Sync — Setup (5 minutes)

The admin panel can automatically push the full applicant roster to a Google
Sheet on **every update** (promotion, rejection, score, task submission, new
applicant). It overwrites a tab called **Candidates** so the sheet is always
current — and Google Sheets exports to real `.xlsx` any time via
`File → Download → Microsoft Excel`.

## 1. Create the sheet + script

1. Create a new Google Sheet (this is where the data will live).
2. In the sheet: **Extensions → Apps Script**.
3. Delete any existing code and paste this:

```javascript
// Open the /exec URL in a browser — if you see the "live" message, the
// deployment + access are correct.
function doGet() {
  return ContentService.createTextOutput('Technovation sync endpoint is LIVE. Use POST.');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();      // requires a BOUND script (see step 1)
    var sheet = ss.getSheetByName('Candidates');
    if (!sheet) sheet = ss.insertSheet('Candidates');
    sheet.clearContents();
    var rows = [data.headers].concat(data.rows || []);
    sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
    SpreadsheetApp.flush();
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, count: (data.rows || []).length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }));
  } finally {
    lock.releaseLock();
  }
}
```

> The data lands in a tab named **Candidates** (created automatically) — not
> `Sheet1`. Check the tabs at the bottom of the spreadsheet.

## 2. Deploy it as a Web App

1. Click **Deploy → New deployment**.
2. Type = **Web app**.
3. **Execute as:** Me.
4. **Who has access:** **Anyone**  ← required so the app can POST to it.
5. **Deploy**, authorize when prompted, and **copy the Web app URL**
   (looks like `https://script.google.com/macros/s/XXXX/exec`).

## 3. Connect it in the admin

1. Open the admin panel → click **⚙ SHEET SYNC**.
2. Paste the Web app URL → **💾 SAVE**.
3. Click **⟳ SYNC NOW** once to push the current roster.

That's it. From now on, every change auto-syncs (debounced ~1s). The dot on the
SHEET SYNC button turns green (●) when sync is active, and the panel shows the
last sync time.

## Troubleshooting — "the sheet is empty"

1. **Wrong tab.** Data goes to a **Candidates** tab, not `Sheet1`. Look at the
   bottom tabs.
2. **Standalone vs bound script.** The script MUST be created from **Extensions
   → Apps Script inside this sheet**. If you made a separate project at
   script.google.com, `getActiveSpreadsheet()` is empty and nothing is written.
3. **Test the endpoint.** Open the `/exec` URL in a browser tab. You should see
   *"Technovation sync endpoint is LIVE."* If you see an error or a login page,
   the deployment or access setting is wrong (must be **Anyone**).
4. **Push manually.** In the admin, open **⚙ SHEET SYNC** and click **⟳ SYNC
   NOW**. Auto-sync only fires when data changes while the admin tab is open.
5. **Re-deploy after edits.** Editing the script doesn't update the live URL —
   do **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
6. **Right URL saved.** It must end in `/exec` (not `/dev`), and you must have
   clicked **💾 SAVE** in the admin.

## Notes

- The URL is stored locally in the admin's browser (`localStorage`), so set it
  once per device you administer from.
- The sync is fire-and-forget (`no-cors`), so a "Synced ✓" status means the
  request was sent; open the sheet to confirm rows. If you see "Sync failed",
  re-check the URL and that access is set to **Anyone**.
- Columns pushed: PlayerNo, Name, Email, Branch, Section, Phone, Domains, Stage,
  TaskScore, InterviewScore, TotalScore, SubmissionLinks, ReviewerNotes, Updated.
- Prefer no third-party sheet? Use **⤓ EXPORT EXCEL / EXPORT CSV** for an
  on-demand snapshot instead.
```
