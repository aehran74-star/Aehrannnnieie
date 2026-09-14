# AEHRAN final GitHub package

Upload the CONTENTS of this folder to one GitHub Pages repository.

- `index.html` = customer storefront (`https://aehran.in/`)
- `admin.html` = admin (`https://aehran.in/admin.html`)
- `assets/` = bundled fallback/seed images
- `.nojekyll` = keeps GitHub Pages static

## Image workflow
The client can upload product, gallery, banner and logo images directly from `admin.html`. Images are compressed in the browser and stored under the separate Firebase Realtime Database branch `aehran_image_store_v1`. The normal store data remains under `aehran_store_v3`, so regular product/order/CMS listeners do not download the full image library on every update. The catalog stores short references such as `dbimg:img_...`.

This build does **not** use Firebase Storage, so the previous Firebase Storage CORS error is avoided.

## Realtime sync
The queued/section-level admin sync fix remains in place. Admin changes write to `aehran_store_v3`; the storefront listens in real time. Admin user accounts remain under `aehran_admin_accounts` with password hashes (no Firebase Authentication).

## Restored storefront behavior
- Original homepage ordering: hero slider -> category circles -> added New Arrivals/Bestsellers sections.
- Original checkout layout/behavior; the extra mobile checkout overlay is disabled.
- Thank-you confirmation remains visible after order placement instead of being closed by a Firebase listener rerender.
- Father & Son Matching is available in Admin Collections, Category Control and Navigation.


## Clean Admin rebuild
- Admin layout restored from the stable build (no split/mixed script block).
- Admin/Manager/Employee cloud login remains enabled.
- Realtime product/order/CMS update queue remains enabled.
- Images can be uploaded directly from Admin; they are compressed and stored under `aehran_image_store_v1` separately from `aehran_store_v3`.
- Father & Son Matching is available in Navigation, Collections and Category Control.
