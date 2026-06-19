# TikTok App Review submission

Use this checklist when resubmitting Algoritmia Gestion in TikTok for Developers.

## Public URLs

- Website URL: `https://app.algoritmiadesarrollos.com.ar/tiktok-review.html`
- Secure app login: `https://app.algoritmiadesarrollos.com.ar/#/login`
- Privacy Policy URL: `https://app.algoritmiadesarrollos.com.ar/privacy.html`
- Terms of Service URL: `https://app.algoritmiadesarrollos.com.ar/terms.html`
- Redirect URI for TikTok Ads / Business API: `https://app.algoritmiadesarrollos.com.ar/api/tiktok-callback`
- Redirect URI for TikTok organic / Content Posting API: `https://app.algoritmiadesarrollos.com.ar/api/tiktok-content-callback`

## Login Kit settings

In the TikTok Developer Portal, Product > Login Kit > Redirect URI > Web:

```text
https://app.algoritmiadesarrollos.com.ar/api/tiktok-content-callback
```

Do not use the login page, hash routes, or URLs with query params here. The app code builds the TikTok auth URL with this same callback from `/api/oauth?action=tiktok-content-authorize`.

## App details

- App name: `Algoritmia Gestion`
- Category: Business / Productivity / Marketing, whichever TikTok makes available.
- Short description:

```text
Algoritmia Gestion helps ecommerce teams manage social content, comments, ads insights, orders, inventory and customer support from one secure web dashboard.
```

## Requested products and scopes

Request only the scopes that the current integration actually uses.

- Login Kit: required for TikTok organic OAuth.
- TikTok Ads / Business API OAuth: use it only for advertising reporting and advertiser assets.
- Display API: request `user.info.basic` for account identity. Request `video.list` only if the app imports TikTok account/video data and that flow is shown in the demo.
- Content Posting API upload flow: request `video.upload` if the app uploads drafts for the user to finish in TikTok. This is the safest first approval path because the current implementation sends the video to TikTok inbox/upload flow.
- Content Posting API direct post flow: request `video.publish` only if the app directly publishes to TikTok after explicit confirmation and the demo shows that exact direct-post flow.

Avoid requesting TikTok Ads scopes in this app unless the TikTok Ads workflow is implemented and shown in the demo. If the current user-facing feature is organic TikTok publishing, submit for organic TikTok first.

Recommended first submission:

```text
Products: Login Kit, Content Posting API
Scopes: user.info.basic, video.upload
```

Add `video.publish`, `video.list`, or TikTok Ads/Business scopes only when the demo video clearly shows those features working end to end.

## App review text

Paste this in the review reason / app review information box and adjust the scope names if needed:

```text
Algoritmia Gestion is a production SaaS web application for ecommerce businesses. Users connect their own commerce and social accounts to manage social publishing, comments, ads insights, orders, inventory and customer workflows from a secure dashboard.

TikTok is used in two separated workflows:
1. TikTok Ads / Business API: the user connects TikTok Business to let Algoritmia read advertiser/campaign/video reporting for the connected ecommerce client.
2. TikTok organic / Content Posting API: the user connects a TikTok account, returns to the Publisher, uploads a video or image, writes post copy, selects TikTok and confirms publication/upload.

The Website URL is a public product page with visible Privacy Policy and Terms of Service links:
https://app.algoritmiadesarrollos.com.ar/tiktok-review.html

OAuth callback URLs configured in the production app:
TikTok Ads / Business API: https://app.algoritmiadesarrollos.com.ar/api/tiktok-callback
TikTok organic / Content Posting API: https://app.algoritmiadesarrollos.com.ar/api/tiktok-content-callback

The secure app dashboard is:
https://app.algoritmiadesarrollos.com.ar/#/login

Reviewer test account:
Username: selkaarg
Password: selkaarg

Please use the test account only for review. It contains a demo ecommerce workspace showing integrations, social publishing, comments and analytics workflows.
```

## Demo video script

Record a 60-120 second screen capture.

1. Open `https://app.algoritmiadesarrollos.com.ar/tiktok-review.html`.
2. Show the visible Privacy Policy and Terms of Service links.
3. Click/open the secure app login.
4. Log in with the reviewer test account.
5. Go to Integraciones.
6. Show TikTok as a separate social integration.
7. Click TikTok connect or show the connection state if it is already connected.
8. Go to Publicador.
9. Upload/select a sample video.
10. Select TikTok as the channel.
11. Show the confirmation step before publishing/uploading.
12. If production posting is not available until approval, explain in the video that the flow is ready but final TikTok API access requires app approval.

## Common rejection fixes

- Do not use `/login` as Website URL.
- Do not use a generic landing page with only sales copy.
- Make Privacy Policy and Terms links visible directly from the Website URL.
- Provide the test account in the review reason if the dashboard requires login.
- Upload a demo video of the current working integration, not just screenshots.
- Keep requested scopes aligned with the visible demo.
- The domain shown in the demo video must match the Website URL domain.
- If TikTok says Website URL cannot be a landing page, use the public review page and show product sections, visible legal links and the actual secure app flow.
