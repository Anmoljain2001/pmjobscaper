import { parseAlertHtml } from '../src/sources/linkedinEmail.js';
import { parseSearchHtml } from '../src/sources/linkedinPublic.js';
const email = `<table><tr><td><a href="https://www.linkedin.com/comm/jobs/view/4011112222/?trackingId=x">Senior Product Manager</a>
<p>Acme Fintech · Bengaluru, Karnataka (Hybrid)</p><a href="https://www.linkedin.com/comm/jobs/view/4011112222/">View job</a></td></tr>
<tr><td><a href="https://www.linkedin.com/comm/jobs/view/4011113333/">Program Manager</a><p>Other Co · Pune</p></td></tr></table>`;
console.log(parseAlertHtml(email));
const search = `<li><div class="base-card"><a class="base-card__full-link" href="https://in.linkedin.com/jobs/view/product-manager-at-acme-4019998888?refId=x"></a>
<h3 class="base-search-card__title"> Product Manager </h3><h4 class="base-search-card__subtitle"><a>Acme</a></h4>
<span class="job-search-card__location">Mumbai, Maharashtra, India</span><time datetime="2026-11-03"></time></div></li>`;
console.log(parseSearchHtml(search));
