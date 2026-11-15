/* Shared advertisement form: markup + fill/read helpers (used by submit, user edit, admin edit) */
(function () {
  'use strict';
  const { esc, icon } = ST;

  function field(name, label, control, { optional = false, hint = '' } = {}) {
    return `<div class="field" data-field="${name}"><label for="f-${name}">${label}${optional ? '<span class="opt">(optional)</span>' : '<span class="req" aria-hidden="true">*</span>'}</label>${control}${hint ? `<div class="hint">${hint}</div>` : ''}<div class="err" role="alert"></div></div>`;
  }
  const inp = (name, type, ph, extra = '') => `<input class="input" id="f-${name}" name="${name}" type="${type}" placeholder="${ph}" ${extra}>`;

  function html({ imageRequired = true } = {}) {
    return `
    <div class="form-alert" role="alert"></div>
    <div class="form-section">
      <h3><span class="n">1</span>Contact details</h3>
      <div class="row2">
        ${field('full_name', 'Full Name', inp('full_name', 'text', 'e.g. Amina Rahman', 'maxlength="100" autocomplete="name" required'))}
        ${field('email', 'Email Address', inp('email', 'email', 'you@company.com', 'maxlength="254" autocomplete="email" inputmode="email" required'))}
      </div>
      <div class="row2">
        ${field('whatsapp', 'WhatsApp Number', inp('whatsapp', 'tel', '+1 555 123 4567', 'maxlength="25" autocomplete="tel" inputmode="tel" required'), { hint: '<span>Include country code</span>' })}
        ${field('company', 'Business / Company Name', inp('company', 'text', 'Your business name', 'maxlength="120" autocomplete="organization" required'))}
      </div>
    </div>
    <div class="form-section">
      <h3><span class="n">2</span>Advertisement content</h3>
      ${field('title', 'Advertisement Title', inp('title', 'text', 'A short, catchy headline', 'maxlength="120" required'))}
      ${field('category_id', 'Advertisement Category', '<select class="input" id="f-category_id" name="category_id" required></select>')}
      ${field('description', 'Advertisement Description', '<textarea class="input" id="f-description" name="description" maxlength="2000" placeholder="Describe what you are promoting, your offer and your target audience…" required></textarea>', { hint: '<span>Minimum 20 characters</span><span class="count" data-count="description">0 / 2000</span>' })}
      <div class="row2">
        ${field('website_url', 'Website URL', inp('website_url', 'url', 'https://yourwebsite.com', 'maxlength="500" autocomplete="url" inputmode="url"'), { optional: true })}
        ${field('social_url', 'Instagram / Facebook Link', inp('social_url', 'url', 'https://instagram.com/yourpage', 'maxlength="500" inputmode="url"'), { optional: true })}
      </div>
      <div class="field" data-field="image">
        <label>Upload Advertisement Image / Banner${imageRequired ? '<span class="req" aria-hidden="true">*</span>' : '<span class="opt">(leave empty to keep current image)</span>'}</label>
        <div class="image-picker">
          <div class="dropzone">
            <input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Upload advertisement image">
            ${icon('upload', 'ic')}
            <div style="font-weight:600">Tap to upload or drag &amp; drop</div>
            <div class="small dim">JPG, PNG, WEBP or GIF · up to 5 MB</div>
          </div>
          <div class="preview"><img alt="Advertisement preview"><div class="meta"><span class="meta-text"></span><button class="btn btn-sm btn-bad" type="button" data-remove>Remove</button></div></div>
        </div>
        <div class="err" role="alert"></div>
      </div>
    </div>
    <div class="form-section">
      <h3><span class="n">3</span>Placement &amp; schedule</h3>
      <div class="field" data-field="ad_type"><span class="label">Advertisement Type<span class="req" aria-hidden="true">*</span></span><div class="radio-cards type-cards" role="radiogroup" aria-label="Advertisement type"></div><div class="err" role="alert"></div></div>
      <div class="field" data-field="duration_days"><span class="label">Advertisement Duration<span class="req" aria-hidden="true">*</span></span><div class="radio-cards dur-cards" role="radiogroup" aria-label="Advertisement duration"></div><div class="err" role="alert"></div></div>
      ${field('instructions', 'Additional Instructions', '<textarea class="input" id="f-instructions" name="instructions" maxlength="1000" style="min-height:100px" placeholder="Anything our team should know — preferred dates, placement, targeting, etc."></textarea>', { optional: true })}
    </div>`;
  }

  /** Mount form markup into `form`, load selects, wire counter + image picker. */
  async function mount(form, { imageRequired = true, meta, host } = {}) {
    form.setAttribute('novalidate', '');
    const m = meta || await ST.loadMeta();
    const holder = document.createElement('div');
    holder.innerHTML = html({ imageRequired });
    (host || form).prepend(...holder.childNodes);
    ST.fillSelects(form, m);
    const ta = form.elements.description; const cnt = form.querySelector('[data-count=description]');
    const upd = () => { cnt.textContent = `${ta.value.length} / 2000`; };
    ta.addEventListener('input', upd); upd();
    const picker = ST.initImagePicker(form.querySelector('.image-picker'), { maxMB: m.max_image_mb });
    // live-clear errors on edit
    form.addEventListener('input', (e) => { const f = e.target.closest('.field'); if (f) f.classList.remove('invalid'); });
    form.addEventListener('change', (e) => { const f = e.target.closest('.field'); if (f) f.classList.remove('invalid'); });
    return { picker, meta: m, updateCount: upd };
  }

  function fill(form, ad, ctx) {
    const set = (n, v) => { if (form.elements[n]) form.elements[n].value = v ?? ''; };
    ['full_name', 'email', 'whatsapp', 'company', 'title', 'description', 'website_url', 'social_url', 'instructions'].forEach((n) => set(n, ad[n]));
    const sel = form.elements.category_id;
    if (![...sel.options].some((o) => o.value === String(ad.category_id))) {
      sel.insertAdjacentHTML('beforeend', `<option value="${ad.category_id}">${esc(ad.category)} (inactive)</option>`);
    }
    sel.value = String(ad.category_id);
    const t = form.querySelector(`[name=ad_type][value="${CSS.escape(ad.ad_type)}"]`); if (t) t.checked = true;
    const d = form.querySelector(`[name=duration_days][value="${ad.duration_days}"]`); if (d) d.checked = true;
    ctx.updateCount();
    ctx.picker.reset();
    ctx.picker.setExisting(ad.image_url, 'Current image');
  }

  function toFormData(form) {
    const fd = new FormData();
    ['full_name', 'email', 'whatsapp', 'company', 'title', 'category_id', 'description', 'website_url', 'social_url', 'instructions'].forEach((n) => fd.append(n, form.elements[n].value.trim()));
    const t = form.querySelector('[name=ad_type]:checked'); if (t) fd.append('ad_type', t.value);
    const d = form.querySelector('[name=duration_days]:checked'); if (d) fd.append('duration_days', d.value);
    const f = form.elements.image.files[0]; if (f) fd.append('image', f);
    return fd;
  }

  ST.adForm = { mount, fill, toFormData };
})();
