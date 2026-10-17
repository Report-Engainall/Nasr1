# Recovery branch build preflight

- npm ci --ignore-scripts exit code: 0
- npm run build exit code: 0

This preflight does not delete recovered code. A failed check indicates a dependency/type/configuration issue to fix before merge.

## npm ci log tail
~~~text

added 86 packages, and audited 87 packages in 5s

8 packages are looking for funding
  run `npm fund` for details

4 vulnerabilities (3 moderate, 1 high)

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
~~~

## build log tail
~~~text
[2mdist/[22m[2massets/[22m[36mactivity-CkwJFIwc.js             [39m[1m[2m  0.40 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
[2mdist/[22m[2massets/[22m[36mcircle-alert-CMq3vo3P.js         [39m[1m[2m  0.42 kB[22m[1m[22m[2m │ gzip:   0.29 kB[22m
[2mdist/[22m[2massets/[22m[36mchart-column-DB9x0Kaz.js         [39m[1m[2m  0.42 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
[2mdist/[22m[2massets/[22m[36mshopping-bag-BMsuFraD.js         [39m[1m[2m  0.42 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
[2mdist/[22m[2massets/[22m[36meye-Hagobsk4.js                  [39m[1m[2m  0.42 kB[22m[1m[22m[2m │ gzip:   0.30 kB[22m
[2mdist/[22m[2massets/[22m[36mtypes-CcUsFyCv.js                [39m[1m[2m  0.43 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
[2mdist/[22m[2massets/[22m[36mzap-Ca3Mefav.js                  [39m[1m[2m  0.43 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36mtriangle-alert-BojL7ST3.js       [39m[1m[2m  0.43 kB[22m[1m[22m[2m │ gzip:   0.31 kB[22m
[2mdist/[22m[2massets/[22m[36mimage-BIbSk1Yh.js                [39m[1m[2m  0.44 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mpencil-B_8rk5XE.js               [39m[1m[2m  0.45 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36msend-Bs0zwAsO.js                 [39m[1m[2m  0.46 kB[22m[1m[22m[2m │ gzip:   0.33 kB[22m
[2mdist/[22m[2massets/[22m[36musers-qSPVaDH2.js                [39m[1m[2m  0.47 kB[22m[1m[22m[2m │ gzip:   0.32 kB[22m
[2mdist/[22m[2massets/[22m[36mscroll-text-2Dc9JX-V.js          [39m[1m[2m  0.52 kB[22m[1m[22m[2m │ gzip:   0.33 kB[22m
[2mdist/[22m[2massets/[22m[36mtrash-2-6l_OKwHo.js              [39m[1m[2m  0.53 kB[22m[1m[22m[2m │ gzip:   0.35 kB[22m
[2mdist/[22m[2massets/[22m[36meye-off-BU-47Ot-.js              [39m[1m[2m  0.60 kB[22m[1m[22m[2m │ gzip:   0.38 kB[22m
[2mdist/[22m[2massets/[22m[36mfolder-tree-B8OQOe10.js          [39m[1m[2m  0.65 kB[22m[1m[22m[2m │ gzip:   0.37 kB[22m
[2mdist/[22m[2massets/[22m[36mlightbulb-6cvQ9FV6.js            [39m[1m[2m  0.94 kB[22m[1m[22m[2m │ gzip:   0.46 kB[22m
[2mdist/[22m[2massets/[22m[36mboxes-eQMlR46o.js                [39m[1m[2m  1.02 kB[22m[1m[22m[2m │ gzip:   0.50 kB[22m
[2mdist/[22m[2massets/[22m[36mProductCard-xw1zZGG5.js          [39m[1m[2m  1.85 kB[22m[1m[22m[2m │ gzip:   0.86 kB[22m
[2mdist/[22m[2massets/[22m[36mPendingApprovalPage-DXu6PuKe.js  [39m[1m[2m  2.09 kB[22m[1m[22m[2m │ gzip:   0.90 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminSettings-CbUXcibr.js        [39m[1m[2m  2.56 kB[22m[1m[22m[2m │ gzip:   1.29 kB[22m
[2mdist/[22m[2massets/[22m[36mOrdersPage-BFm95dNW.js           [39m[1m[2m  2.57 kB[22m[1m[22m[2m │ gzip:   1.35 kB[22m
[2mdist/[22m[2massets/[22m[36mLoginPage-DIkXs8Gj.js            [39m[1m[2m  2.79 kB[22m[1m[22m[2m │ gzip:   1.33 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminAuditLog-BZCxcio_.js        [39m[1m[2m  3.19 kB[22m[1m[22m[2m │ gzip:   1.47 kB[22m
[2mdist/[22m[2massets/[22m[36mWishlistPage-jYm78oJb.js         [39m[1m[2m  3.40 kB[22m[1m[22m[2m │ gzip:   1.55 kB[22m
[2mdist/[22m[2massets/[22m[36mProductsPage-CKU0qcjE.js         [39m[1m[2m  3.53 kB[22m[1m[22m[2m │ gzip:   1.50 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminNotifications-BSBkSYrt.js   [39m[1m[2m  3.56 kB[22m[1m[22m[2m │ gzip:   1.51 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminCategories-DPcf-qE4.js      [39m[1m[2m  3.86 kB[22m[1m[22m[2m │ gzip:   1.68 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminSuppliers-DCRs6f6n.js       [39m[1m[2m  4.09 kB[22m[1m[22m[2m │ gzip:   1.43 kB[22m
[2mdist/[22m[2massets/[22m[36mProductDetailPage-D8i1Z6u_.js    [39m[1m[2m  4.13 kB[22m[1m[22m[2m │ gzip:   1.84 kB[22m
[2mdist/[22m[2massets/[22m[36mRegisterPage-BQilteBR.js         [39m[1m[2m  4.86 kB[22m[1m[22m[2m │ gzip:   2.14 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminLayout-DR4FeY71.js          [39m[1m[2m  5.21 kB[22m[1m[22m[2m │ gzip:   1.93 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminInventory-LMLbuREF.js       [39m[1m[2m  5.30 kB[22m[1m[22m[2m │ gzip:   2.09 kB[22m
[2mdist/[22m[2massets/[22m[36mHomePage-Dt1qnEg3.js             [39m[1m[2m  5.44 kB[22m[1m[22m[2m │ gzip:   2.13 kB[22m
[2mdist/[22m[2massets/[22m[36mOrderDetailPage-BJU1pxcI.js      [39m[1m[2m  5.79 kB[22m[1m[22m[2m │ gzip:   1.87 kB[22m
[2mdist/[22m[2massets/[22m[36mComparePage-BKtYhS4p.js          [39m[1m[2m  5.82 kB[22m[1m[22m[2m │ gzip:   2.20 kB[22m
[2mdist/[22m[2massets/[22m[36mCartPage-CtOH6jtN.js             [39m[1m[2m  6.21 kB[22m[1m[22m[2m │ gzip:   2.41 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminBanners-Cl1MNntu.js         [39m[1m[2m  6.51 kB[22m[1m[22m[2m │ gzip:   2.29 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminCustomers-BQoxXsUP.js       [39m[1m[2m  6.62 kB[22m[1m[22m[2m │ gzip:   2.18 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminOrders-C2bTvVRn.js          [39m[1m[2m  7.11 kB[22m[1m[22m[2m │ gzip:   2.52 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminDashboard-0tDIWufV.js       [39m[1m[2m  8.06 kB[22m[1m[22m[2m │ gzip:   2.69 kB[22m
[2mdist/[22m[2massets/[22m[36mCommerceAssistant-DcDoWZPE.js    [39m[1m[2m  8.18 kB[22m[1m[22m[2m │ gzip:   3.27 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminPricing-yUWWqTzE.js         [39m[1m[2m  8.23 kB[22m[1m[22m[2m │ gzip:   2.74 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminProducts-Bec_v64u.js        [39m[1m[2m 10.22 kB[22m[1m[22m[2m │ gzip:   2.89 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminCustomer360-BwYTrkAU.js     [39m[1m[2m 10.82 kB[22m[1m[22m[2m │ gzip:   3.15 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminAiWorkspace-CfzeEJly.js     [39m[1m[2m 13.02 kB[22m[1m[22m[2m │ gzip:   3.55 kB[22m
[2mdist/[22m[2massets/[22m[36mapi-qF-7cf7o.js                  [39m[1m[2m 13.09 kB[22m[1m[22m[2m │ gzip:   4.19 kB[22m
[2mdist/[22m[2massets/[22m[36mAdminReports-CxvWAHrx.js         [39m[1m[2m 17.47 kB[22m[1m[22m[2m │ gzip:   4.17 kB[22m
[2mdist/[22m[2massets/[22m[36mindex-B0Q1b2Go.js                [39m[1m[2m429.67 kB[22m[1m[22m[2m │ gzip: 124.13 kB[22m
[32m✓ built in 3.16s[39m
~~~
