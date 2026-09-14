# AEHRAN GitHub-ready build

## Upload this folder structure to GitHub
- `index.html` = customer storefront
- `admin.html` = admin panel
- `assets/images/` = static website images
- `.nojekyll` = keeps GitHub Pages simple

## What changed
- Firebase Storage was removed from both HTML files.
- Firebase Realtime Database remains connected for products, stock, CMS text/settings, orders, returns and reviews.
- Embedded base64 images were extracted to `assets/images/`.
- Old Firebase Storage image URLs are rejected in the UI, so static/local images are preferred.
- Admin writes are serialized and written per database section instead of overwriting the whole root every time.
- User storefront listens with `onValue()` on products, CMS, orders, reviews, returns and media.
- Order placement updates only the order and affected product stock fields.

## Changing images later
This build intentionally does NOT upload images from the admin to Firebase.

1. Upload the new image file into `assets/images/` in the same GitHub repository.
2. In Admin, use the image URL/path field and enter:
   `assets/images/your-image.jpg`
3. Save the product/banner. Firebase stores only that small text path.
4. The user website loads the actual image directly from GitHub Pages.

The Admin's file-upload buttons now show a static-image-mode message instead of creating base64 images.

## URLs
If the repository is published at a project path, relative `assets/images/...` paths continue to work automatically.


## Admin URLs and cloud staff logins

Use the same repository for both pages:

- Customer storefront: `https://aehran.in/`
- Admin panel: `https://aehran.in/admin.html`
- GitHub Pages admin fallback: `https://aehran74-star.github.io/aehrannewsdkweb/admin.html`

Admin/Manager/Employee accounts created in **Users & Roles** are synced to Firebase Realtime Database at `/aehran_admin_accounts`. Passwords are stored as salted one-way hashes; plaintext passwords are not stored. Firebase Authentication is not used.

Important: if your Realtime Database rules are still public (`.read: true`, `.write: true`), this custom client-side login is not secure for production because anyone can modify the database directly. Lock down the database before handing the system to a real client.
