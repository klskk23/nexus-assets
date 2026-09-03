# Integrating zenith-printer

*中文版：[`zenith-printer.md`](./zenith-printer.md)*

Label printing does not happen in this system. nexus-assets records devices;
zenith-printer designs labels, drives the printers and owns the job queue.
Either product runs perfectly well alone — point them at each other and
"tick a few devices, print" appears.

This document covers **how to connect the two and how the result is used**.
What a label looks like, which machine prints it, what stock is loaded, how
sequence pools work: all of that lives on the zenith side and is not repeated
here.

## 1. What each side needs configured

**On nexus** (`.env`):

```sh
ZENITH_PRINTER_SERVICE_URL=http://127.0.0.1:3000
```

Leave it out and **nothing about printing appears in the interface** — which is
what an installation with no printer should look like. Set it, and the asset
page gains "Print labels" and the category dialog gains "Print presets".

**On zenith** (its own `.env`):

```sh
NEXUS_ASSETS_SERVICE_URL=http://127.0.0.1:8080
NEXUS_ASSETS_SERVICE_API_KEY=nxk_xxxxxxxxxxxx.yyyyyyyy
```

Create the key under Settings → API keys in nexus; **the secret is shown once**.
A key acts as the account that made it — there is no second permission model.
The admin key from the configuration file (`NEXUS_ADMIN_API_KEY`) works too.
The key lives only in zenith's configuration file: it is never stored in its
database and never echoed back.

The two addresses only have to reach each other; same host is not required.
**Note the directions**: nexus calls zenith to print, and zenith calls nexus for
data. Both paths have to work.

## 2. The data path once they are connected

```
        Rows (zenith → nexus)
zenith  ──  GET /api/categories        which category
        ──  GET /api/rows?category_id= that category's table

        Printing (nexus → zenith)
nexus   ──  GET  /api/print-presets            which labels exist
        ──  POST /api/print-presets/{id}/print print this batch
        ──  GET  /api/print-jobs/{id}          is it out yet
```

The browser **never talks to zenith directly** — it sends no CORS headers. The
preset list and job status are relayed by nexus, as `GET /api/print/presets` and
`GET /api/print/jobs/:id`.

`GET /api/rows` is the tabular view meant for anything outside this system — the
same data as `export.csv` in a different shape:

- **columns are keyed by field key**, not display name, so renaming a label does
  not break the other side's template;
- built-in columns take a `sys_` prefix to get out of the way: field keys are a
  category's own vocabulary, and there is already a field called `sn` today;
- a row's identity is `sys_id`; zenith merges refreshes on it, so a selection
  made before a refresh still means the same devices afterwards;
- there are ten built-in columns: `sys_id`, `sys_sn`, `sys_category`,
  `sys_status`, `sys_holder`, `sys_owner`, `sys_model`, `sys_vendor`,
  `sys_note`, `sys_created_at`;
- **a category is required**, for the same reason: field keys are unique only
  within one category's subtree.

## 3. Adding the data source in zenith

In zenith, Data sources → New → **NEXUS**, then pick a category from the
dropdown. That is the whole form: the address and the key come from its
configuration file rather than being typed in a second time.

## 4. Categories and label presets

**A label belongs to a category.** In the category dialog in nexus, tick which
presets that category may print; they are stored as a `print_preset_ids` list.

**A category can have several labels** (an asset-number label, a location
label…). At print time:

- exactly one: it is used without asking;
- several: choose in the print dialog;
- several and none chosen: the server **refuses that batch** rather than
  guessing.

The preset itself — template, printer, stock, copies — is defined on the zenith
side; nexus stores only the id.

## 5. Two entrances, and the confirmation

There are two ways in: the **action bar** on the asset page (print the ticked
ones) and the **row context menu** (print this one, without ticking first).

**Paper always gets one confirmation first**, because it really does come out of
a machine in another room:

1. opening the dialog sends a `dry_run` first, which lays out the batches
   (**one print run = one category**), **the numbers of the devices about to be
   printed**, which label each batch uses, and which category cannot be printed
   at all;
2. only the second press spends paper;
3. after confirming, the button is gone — the same dialog cannot print twice.

Once submitted, nexus polls the job until it finishes or fails. Numbers that the
job consumed from zenith's sequence pools (`seqClaims`) are shown — they are
minted over there, and not saying so means two numbering schemes drifting apart.

On failure the dialog links to zenith's `/queue`, which is where a stuck job is
released.

## 6. Jumping over to print by hand

In the print dialog the label's own name is a link:

```
{ZENITH_PRINTER_SERVICE_URL}/design/{templateId}?preset={presetId}
```

`templateId` comes from `GET /api/print-presets`. Today that link opens **the
right template**; `?preset=` is there for zenith to also preselect **the printer
and the print settings**, and takes effect once zenith honours the parameter
(not implemented as of writing — the link is harmless meanwhile). The category
dialog has a second link to `/print-presets`, which is where labels are managed.

**Clicking that link first has zenith re-read the category.** The designer draws
from zenith's own copy of the rows, which is only as fresh as the last time
somebody pressed refresh over there — without this, the device you clicked
through to check shows yesterday's holder, and nothing on either screen says
why.

The chain is `POST /api/print/refresh-source {"category_id"}` →
`GET {zenith}/api/data-sources` to find the tables whose `sourceKind` is `nexus`
and whose `nexus.categoryId` matches → `POST {zenith}/api/data-sources/{id}/refresh`
for each. Three things to know:

- **every table bound to that category is refreshed**; a category may have more
  than one (two labels wanting different columns);
- **none connected is not an error** — the dialog says plainly that what zenith
  shows is its own table;
- **a changed column set comes back as `needsConfirmation` and nothing is
  refreshed.** nexus does not send `confirmColumnChange`: it means the
  category's fields moved, a label that reads a column by name can break, and
  that nod belongs to somebody looking at zenith.

The refresh goes out as the browser opens the new tab, without holding the
navigation up (holding it and then calling `window.open` gets caught as a
popup). zenith has two refresh paths of its own — the per-source interval and
`refreshBeforePrint` on submission; this one covers **a person jumping over to
look**.

## 7. When it does not work, look here first

| Symptom | Usually |
| --- | --- |
| Nothing about printing in the interface | `ZENITH_PRINTER_SERVICE_URL` is not set on nexus |
| The print button is there, the preset list is empty | The address is set but the service is down, or the category has no preset ticked |
| zenith reports `NEXUS_UNAUTHORISED` on refresh | The key was deleted or mistyped; make a new one |
| zenith reports `NEXUS_BAD_REQUEST` | The request carried no category — `/api/rows` requires one |
| A batch has `error` and no `job_id` | That batch never left (no preset, several labels and none chosen, or the service refused); the other batches still went |
| It printed twice | The button disappears after confirming, so one dialog cannot print twice; a script should send its own `Idempotency-Key` header (nexus forwards it per batch as `key:categoryId`) and a repeat then returns the same job. Without one, every submission is a new job |

See also `CLAUDE.md` (the printing rule) and, in
`specs/001-asset-ledger-demo/contracts/openapi.yaml`, `/print`,
`/print/presets`, `/print/jobs/{id}` and `/rows`.
